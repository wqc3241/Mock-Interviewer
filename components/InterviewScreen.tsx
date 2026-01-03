
import React, { useState, useEffect } from 'react';
import { useInterviewSession } from '../hooks/useInterviewSession';
import { InterviewSettings, JobDescription, TranscriptItem, ResearchedPersona } from '../types';

interface InterviewScreenProps {
  jobDescription: JobDescription;
  settings: InterviewSettings;
  persona: ResearchedPersona | null;
  onEndSession: (transcript: TranscriptItem[]) => void;
}

const InterviewScreen: React.FC<InterviewScreenProps> = ({ jobDescription, settings, persona, onEndSession }) => {
  const apiKey = process.env.API_KEY || '';
  const { isConnected, isModelSpeaking, currentVolume, transcript, textBuffer, disconnect } = useInterviewSession({
    apiKey, jobDescription, persona, onDisconnect: () => {}
  });

  const [timeLeft, setTimeLeft] = useState(settings.timeLimitSeconds);

  useEffect(() => {
    let interval: any;
    // Timer only runs when the candidate is supposed to be talking
    if (!isModelSpeaking && isConnected && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (isModelSpeaking) {
      // Reset or pause timer when model speaks
      setTimeLeft(settings.timeLimitSeconds);
    }
    return () => clearInterval(interval);
  }, [isModelSpeaking, isConnected, timeLeft, settings.timeLimitSeconds]);

  const ringSize = 140 + (currentVolume * 300);

  return (
    <div className="max-w-5xl mx-auto h-[85vh] flex flex-col bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-white/5 relative">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
            {persona?.name[0] || "A"}
          </div>
          <div className="max-w-md">
            <h2 className="text-white font-bold leading-tight">{persona?.name || "AI Interviewer"}</h2>
            <p className="text-gray-400 text-[10px] leading-tight truncate mt-0.5">
              {persona?.backgroundSummary || "Professional Session"}
            </p>
          </div>
        </div>
        <button 
          onClick={() => { disconnect(); onEndSession(transcript); }}
          className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-6 py-2 rounded-full text-sm font-bold transition-all border border-red-500/20"
        >
          End Session
        </button>
      </div>

      {/* Main Stage */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {/* Visualizer Aura - Reacts to user input */}
        {!isModelSpeaking && isConnected && (
          <div 
            className="absolute rounded-full transition-all duration-150 blur-3xl opacity-20 bg-green-500"
            style={{ width: ringSize * 1.5, height: ringSize * 1.5 }}
          />
        )}
        
        {/* Visualizer Aura - Reacts to model output */}
        {isModelSpeaking && (
           <div 
           className="absolute rounded-full transition-all duration-300 blur-3xl opacity-30 bg-indigo-500 animate-pulse"
           style={{ width: 400, height: 400 }}
         />
        )}
        
        <div className="relative z-10 flex flex-col items-center gap-12 w-full px-12">
          {/* Avatar Ring */}
          <div className={`relative transition-transform duration-500 ${isModelSpeaking ? 'scale-110' : 'scale-100'}`}>
             <div className="w-48 h-48 rounded-full border-4 border-white/10 flex items-center justify-center bg-gray-800 shadow-2xl overflow-hidden relative">
                {isModelSpeaking ? (
                  <div className="flex gap-1 items-end h-16">
                    {[0, 0.2, 0.4, 0.1, 0.3].map((delay, i) => (
                      <div key={i} className="w-1.5 bg-indigo-400 animate-[bounce_0.6s_infinite]" style={{ height: '100%', animationDelay: `${delay}s` }} />
                    ))}
                  </div>
                ) : (
                  <svg className={`w-20 h-20 transition-colors ${currentVolume > 0.05 ? 'text-green-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
             </div>
             {isModelSpeaking && <div className="absolute inset-0 rounded-full border-4 border-indigo-500 animate-ping opacity-25" />}
             {!isModelSpeaking && currentVolume > 0.05 && <div className="absolute inset-0 rounded-full border-4 border-green-500 animate-ping opacity-10" />}
          </div>

          <div className="max-w-2xl w-full text-center space-y-6">
             {isModelSpeaking ? (
                <div className="space-y-4">
                  <p className="text-gray-500 uppercase tracking-widest text-[10px] font-bold">Interviewer is speaking...</p>
                  <p className="text-2xl text-white font-medium leading-relaxed drop-shadow-lg min-h-[3rem]">
                    {textBuffer ? `"${textBuffer}"` : "..."}
                  </p>
                </div>
             ) : (
                <div className="flex flex-col items-center gap-4">
                   <p className="text-gray-500 uppercase tracking-widest text-[10px] font-bold">Your turn to answer</p>
                   <div className="flex flex-col items-center gap-2">
                      <span className={`font-mono text-4xl transition-colors ${timeLeft < 15 ? 'text-red-500 animate-pulse' : 'text-green-400'}`}>
                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                      </span>
                      <div className="h-1.5 w-32 bg-gray-800 rounded-full overflow-hidden">
                         <div className="h-full bg-green-500 transition-all duration-75" style={{ width: `${Math.min(100, currentVolume * 400)}%` }} />
                      </div>
                   </div>
                </div>
             )}
          </div>
        </div>
      </div>

      {/* Transcript Footer (Partial history) */}
      <div className="h-40 bg-black/40 border-t border-white/10 p-6 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-4 opacity-40 hover:opacity-100 transition-opacity">
          {transcript.slice(-2).map((t, i) => (
            <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
               <span className="text-[10px] font-bold text-gray-500 uppercase mb-1">
                 {t.role === 'user' ? 'You' : (persona?.name || 'Interviewer')}
               </span>
               <div className={`p-3 rounded-2xl text-sm max-w-[85%] ${t.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-gray-800 text-gray-300 rounded-tl-none'}`}>
                 {t.text}
               </div>
            </div>
          ))}
          {transcript.length === 0 && !isModelSpeaking && (
            <div className="text-center text-gray-600 text-sm italic">Waiting for interview to begin...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterviewScreen;

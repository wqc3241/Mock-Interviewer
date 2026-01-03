
import React, { useState, useEffect, useCallback } from 'react';
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
  
  // Memoize to prevent useInterviewSession from re-running in a loop
  const handleDisconnect = useCallback(() => {
    console.log("Interview session disconnected");
  }, []);

  const { 
    isConnected, 
    isModelSpeaking, 
    currentVolume, 
    transcript, 
    textBuffer, 
    audioContextSuspended,
    resumeAudio,
    disconnect 
  } = useInterviewSession({
    apiKey, 
    jobDescription, 
    persona, 
    onDisconnect: handleDisconnect
  });

  const [timeLeft, setTimeLeft] = useState(settings.timeLimitSeconds);

  useEffect(() => {
    let interval: any;
    if (!isModelSpeaking && isConnected && !audioContextSuspended && transcript.length > 0 && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (isModelSpeaking) {
      setTimeLeft(settings.timeLimitSeconds);
    }
    return () => clearInterval(interval);
  }, [isModelSpeaking, isConnected, timeLeft, settings.timeLimitSeconds, audioContextSuspended, transcript.length]);

  const ringSize = 140 + (currentVolume * 300);

  return (
    <div className="max-w-5xl mx-auto h-[85vh] flex flex-col bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-white/5 relative">
      
      {/* Audio Context Activation Overlay */}
      {audioContextSuspended && (
        <div 
          className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center cursor-pointer group"
          onClick={resumeAudio}
        >
          <div className="w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-2xl shadow-indigo-500/40">
            <svg className="w-12 h-12 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Ready to Start?</h2>
          <p className="text-gray-400 max-w-sm text-lg">Click anywhere to activate your audio and begin the interview with {persona?.name || 'the recruiter'}.</p>
          <div className="mt-8 px-6 py-2 border border-white/10 rounded-full text-xs text-gray-500 uppercase tracking-widest animate-pulse">
            Waiting for user interaction
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
            {persona?.name[0] || "A"}
          </div>
          <div className="max-w-md">
            <h2 className="text-white font-bold leading-tight">{persona?.name || "AI Interviewer"}</h2>
            <p className="text-gray-400 text-[10px] leading-tight truncate mt-0.5 uppercase tracking-tighter">
              {persona?.companyVibe || "Professional Session"}
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
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent">
        
        {!isConnected && (
           <div className="absolute top-4 bg-yellow-500/20 text-yellow-500 px-4 py-1 rounded-full text-xs font-bold animate-pulse border border-yellow-500/20">
             Establishing Secure Connection...
           </div>
        )}

        {/* Visualizer Aura */}
        <div 
          className={`absolute rounded-full transition-all duration-500 blur-[100px] opacity-20 ${isModelSpeaking ? 'bg-indigo-500' : 'bg-green-500'}`}
          style={{ width: isModelSpeaking ? 500 : ringSize * 2, height: isModelSpeaking ? 500 : ringSize * 2 }}
        />
        
        <div className="relative z-10 flex flex-col items-center gap-12 w-full px-12">
          {/* Avatar Ring */}
          <div className={`relative transition-all duration-700 ${isModelSpeaking ? 'scale-110' : 'scale-100'}`}>
             <div className="w-56 h-56 rounded-full border-8 border-white/5 flex items-center justify-center bg-gray-800 shadow-2xl overflow-hidden relative">
                {isModelSpeaking ? (
                  <div className="flex gap-1.5 items-end h-20">
                    {[0, 0.2, 0.4, 0.1, 0.3, 0.5, 0.2].map((delay, i) => (
                      <div key={i} className="w-2 bg-indigo-400 animate-[bounce_0.8s_infinite] rounded-full" style={{ height: '100%', animationDelay: `${delay}s` }} />
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    <svg className={`w-24 h-24 transition-all duration-300 ${currentVolume > 0.02 ? 'text-green-400 scale-110' : 'text-gray-600 scale-100'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                )}
             </div>
             {isModelSpeaking && <div className="absolute -inset-4 rounded-full border border-indigo-500/30 animate-ping opacity-20" />}
             {!isModelSpeaking && currentVolume > 0.05 && <div className="absolute -inset-4 rounded-full border border-green-500/30 animate-ping opacity-20" />}
          </div>

          <div className="max-w-3xl w-full text-center space-y-8">
             {isModelSpeaking ? (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-indigo-400 uppercase tracking-[0.2em] text-[10px] font-black opacity-80">Interviewer Speaking</p>
                  <p className="text-3xl text-white font-medium leading-snug drop-shadow-xl min-h-[4rem] px-8 italic font-serif">
                    {textBuffer ? `"${textBuffer}"` : "Thinking..."}
                  </p>
                </div>
             ) : (
                <div className="flex flex-col items-center gap-6 animate-fade-in">
                   <p className="text-green-500 uppercase tracking-[0.2em] text-[10px] font-black opacity-80">
                     {transcript.length === 0 ? "Listening for Introduction..." : "Your turn to respond"}
                   </p>
                   {transcript.length > 0 && (
                     <div className="flex flex-col items-center gap-4">
                        <div className="px-6 py-2 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                           <span className={`font-mono text-5xl font-light tracking-tighter transition-colors ${timeLeft < 15 ? 'text-red-500 animate-pulse' : 'text-green-400'}`}>
                            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                        <div className="h-1 w-48 bg-gray-800 rounded-full overflow-hidden">
                           <div className="h-full bg-green-500 transition-all duration-75 shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{ width: `${Math.min(100, currentVolume * 500)}%` }} />
                        </div>
                     </div>
                   )}
                </div>
             )}
          </div>
        </div>
      </div>

      {/* Transcript Footer */}
      <div className="h-48 bg-black/40 border-t border-white/5 p-8 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-6 opacity-40 hover:opacity-100 transition-opacity duration-500">
          {transcript.slice(-3).map((t, i) => (
            <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'} animate-slide-up`}>
               <span className="text-[9px] font-black text-gray-500 uppercase mb-2 tracking-widest">
                 {t.role === 'user' ? 'Candidate (You)' : (persona?.name || 'Interviewer')}
               </span>
               <div className={`p-4 rounded-2xl text-sm max-w-[80%] leading-relaxed shadow-lg ${t.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none border border-indigo-400/20' : 'bg-gray-800 text-gray-300 rounded-tl-none border border-white/5'}`}>
                 {t.text}
               </div>
            </div>
          ))}
          {transcript.length === 0 && !isModelSpeaking && isConnected && (
            <div className="text-center text-gray-500 text-xs font-medium tracking-wide py-4 animate-pulse">
              CONNECTION ESTABLISHED. WAITING FOR INTERVIEWER TO OPEN...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterviewScreen;


import React, { useState } from 'react';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import FeedbackScreen from './components/FeedbackScreen';
import { AppState, JobDescription, InterviewSettings, TranscriptItem, ResearchedPersona } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [jobDescription, setJobDescription] = useState<JobDescription | null>(null);
  const [settings, setSettings] = useState<InterviewSettings>({ timeLimitSeconds: 120 });
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [persona, setPersona] = useState<ResearchedPersona | null>(null);

  const handleStartInterview = (jd: JobDescription, s: InterviewSettings, p: ResearchedPersona | null) => {
    setJobDescription(jd);
    setSettings(s);
    setPersona(p);
    setAppState(AppState.INTERVIEW);
  };

  const handleEndSession = (finalTranscript: TranscriptItem[]) => {
    setTranscript(finalTranscript);
    setAppState(AppState.FEEDBACK);
  };

  const handleRestart = () => {
    setAppState(AppState.SETUP);
    setJobDescription(null);
    setTranscript([]);
    setPersona(null);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] font-sans text-gray-100 selection:bg-indigo-500/30">
      <nav className="border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex h-20 items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={handleRestart}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:rotate-12 transition-transform">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </div>
            <span className="font-black text-2xl tracking-tighter">MOCKMATE</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
            {appState === AppState.SETUP ? "Configuration" : appState === AppState.INTERVIEW ? "Live Session" : "Analysis"}
            <span className="w-1 h-1 bg-gray-700 rounded-full" />
            Gemini 3 Powered
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        {appState === AppState.SETUP && (
          <SetupScreen 
            onStart={handleStartInterview} 
            onResearchStart={() => setAppState(AppState.RESEARCHING)}
          />
        )}

        {appState === AppState.RESEARCHING && (
          <div className="max-w-xl mx-auto text-center py-24 space-y-8 animate-pulse">
            <div className="w-24 h-24 bg-indigo-600/20 rounded-full mx-auto flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold">Connecting to Research Tools...</h2>
              <p className="text-gray-400">Gemini is browsing the web to research your interviewer and role specific requirements.</p>
            </div>
          </div>
        )}

        {appState === AppState.INTERVIEW && jobDescription && (
          <InterviewScreen 
            jobDescription={jobDescription} 
            settings={settings} 
            persona={persona}
            onEndSession={handleEndSession} 
          />
        )}

        {appState === AppState.FEEDBACK && jobDescription && (
          <FeedbackScreen 
            transcript={transcript} 
            jobDescription={jobDescription}
            onRestart={handleRestart}
          />
        )}
      </main>
    </div>
  );
};

export default App;

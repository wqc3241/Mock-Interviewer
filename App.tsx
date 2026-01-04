
import React, { useState, useEffect, useCallback } from 'react';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import FeedbackScreen from './components/FeedbackScreen';
import { AppState, JobDescription, InterviewSettings, TranscriptItem, ResearchedPersona, UserProfile, SavedProfile } from './types';

// Updated with the user-provided Google Client ID
const GOOGLE_CLIENT_ID = "612704318712-05gt7v8tmsg66orjd26623enobjct8jo.apps.googleusercontent.com";

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [jobDescription, setJobDescription] = useState<JobDescription | null>(null);
  const [settings, setSettings] = useState<InterviewSettings>({ timeLimitSeconds: 120 });
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [persona, setPersona] = useState<ResearchedPersona | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);

  // Load user and profiles from local storage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('mockmate_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    const savedProfs = localStorage.getItem('mockmate_profiles');
    if (savedProfs) {
      setSavedProfiles(JSON.parse(savedProfs));
    }
  }, []);

  // Persist profiles when they change
  useEffect(() => {
    localStorage.setItem('mockmate_profiles', JSON.stringify(savedProfiles));
  }, [savedProfiles]);

  const handleCredentialResponse = useCallback((response: any) => {
    try {
      // Decode JWT ID Token
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      
      const newUser: UserProfile = {
        name: payload.name,
        email: payload.email,
        picture: payload.picture
      };
      
      setUser(newUser);
      localStorage.setItem('mockmate_user', JSON.stringify(newUser));
    } catch (e) {
      console.error("Failed to decode Google ID Token", e);
    }
  }, []);

  useEffect(() => {
    const initializeGoogleSignIn = () => {
      // Only show button if user is NOT logged in and we are in setup mode
      if ((window as any).google && !user && appState === AppState.SETUP) {
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        
        const buttonDiv = document.getElementById("google-sso-button");
        if (buttonDiv) {
          (window as any).google.accounts.id.renderButton(buttonDiv, {
            theme: "outline",
            size: "large",
            shape: "pill",
            width: 200
          });
        }
      }
    };

    const timer = setTimeout(initializeGoogleSignIn, 500);
    return () => clearTimeout(timer);
  }, [handleCredentialResponse, user, appState]);

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('mockmate_user');
    if ((window as any).google) {
      (window as any).google.accounts.id.disableAutoSelect();
    }
  };

  const saveProfile = (profile: Omit<SavedProfile, 'id' | 'createdAt'>) => {
    const newProfile: SavedProfile = {
      ...profile,
      id: crypto.randomUUID(),
      createdAt: Date.now()
    };
    setSavedProfiles(prev => [newProfile, ...prev]);
  };

  const deleteProfile = (id: string) => {
    setSavedProfiles(prev => prev.filter(p => p.id !== id));
  };

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

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
              {appState === AppState.SETUP ? "Configuration" : appState === AppState.INTERVIEW ? "Live Session" : "Analysis"}
              <span className="w-1 h-1 bg-gray-700 rounded-full" />
              Gemini 3 Powered
            </div>

            {user ? (
              <div className="flex items-center gap-4 bg-white/5 pl-4 pr-2 py-1.5 rounded-full border border-white/10">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold text-white leading-none">{user.name}</span>
                  <button onClick={handleLogout} className="text-[10px] text-gray-400 hover:text-white uppercase font-black tracking-tighter mt-0.5">Logout</button>
                </div>
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full border border-indigo-500/30" />
              </div>
            ) : (
              <div key="login-btn-container" className="flex justify-end">
                <div id="google-sso-button"></div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        {appState === AppState.SETUP && (
          <SetupScreen 
            user={user}
            savedProfiles={savedProfiles}
            onSaveProfile={saveProfile}
            onDeleteProfile={deleteProfile}
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

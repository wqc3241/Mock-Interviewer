
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { JobDescription, InterviewSettings, ResearchedPersona, UserProfile, SavedProfile } from '../types';

interface SetupScreenProps {
  user: UserProfile | null;
  savedProfiles: SavedProfile[];
  onSaveProfile: (profile: Omit<SavedProfile, 'id' | 'createdAt'>) => void;
  onDeleteProfile: (id: string) => void;
  onStart: (jd: JobDescription, settings: InterviewSettings, persona: ResearchedPersona | null) => void;
  onResearchStart: () => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ 
  user, 
  savedProfiles, 
  onSaveProfile, 
  onDeleteProfile,
  onStart, 
  onResearchStart 
}) => {
  const [content, setContent] = useState('');
  const [jdLink, setJdLink] = useState('');
  const [interviewerName, setInterviewerName] = useState('');
  const [timeLimit, setTimeLimit] = useState(2);
  const [isResearching, setIsResearching] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState(false);

  const handleStart = async (customJd?: Partial<JobDescription>) => {
    setIsResearching(true);
    onResearchStart();

    const apiKey = process.env.API_KEY;
    if (!apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    let finalTitle = customJd?.title || "Candidate";
    let researchedPersona: ResearchedPersona | null = null;

    const activeContent = customJd?.content || content;
    const activeLink = customJd?.link || jdLink;
    const activeInterviewer = customJd?.interviewerInfo || interviewerName;

    try {
      const researchPrompt = `
        Research Task:
        1. JOB LINK: ${activeLink || 'Not provided'}
        2. INTERVIEWER: ${activeInterviewer || 'Unknown'}
        3. RAW JD TEXT: ${activeContent.substring(0, 2000)}

        Action: 
        Use Google Search to find details about the company culture, the interviewer's background, and typical interview questions for this specific role. 
        Then, generate a "ResearchedPersona" object.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: researchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              jobTitle: { type: Type.STRING },
              persona: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  style: { type: Type.STRING },
                  companyVibe: { type: Type.STRING },
                  keyTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  backgroundSummary: { type: Type.STRING }
                },
                required: ["name", "style", "companyVibe", "keyTopics", "backgroundSummary"]
              }
            },
            required: ["jobTitle", "persona"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        finalTitle = data.jobTitle;
        researchedPersona = data.persona;
      }
    } catch (e) {
      console.error("Research failed, falling back to basic setup", e);
    }

    onStart(
      { title: finalTitle, content: activeContent, link: activeLink, interviewerInfo: activeInterviewer },
      { timeLimitSeconds: timeLimit * 60 },
      researchedPersona
    );
    setIsResearching(false);
  };

  const handleSaveProfile = () => {
    if (!content && !interviewerName) return;
    onSaveProfile({
      label: interviewerName ? `${interviewerName} @ ${jdLink.split('/')[2] || 'JD'}` : 'Untitled Interview',
      title: 'Interview Profile',
      content,
      link: jdLink,
      interviewerInfo: interviewerName
    });
    setSaveConfirmation(true);
    setTimeout(() => setSaveConfirmation(false), 3000);
  };

  const loadProfile = (p: SavedProfile) => {
    setContent(p.content);
    setJdLink(p.link || '');
    setInterviewerName(p.interviewerInfo || '');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in pb-12">
      {/* Saved Profiles Section */}
      {user && savedProfiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Quick Launch: Saved Interviewers</h3>
            <span className="text-[10px] text-gray-600 font-bold">{savedProfiles.length} PROFILES</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {savedProfiles.map(profile => (
              <div 
                key={profile.id} 
                className="group relative bg-white/5 border border-white/10 p-5 rounded-2xl hover:border-indigo-500/50 hover:bg-white/10 transition-all cursor-pointer"
                onClick={() => loadProfile(profile)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold">
                    {profile.interviewerInfo?.[0] || 'P'}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteProfile(profile.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <h4 className="font-bold text-white truncate text-sm mb-1">{profile.label}</h4>
                <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Last used {new Date(profile.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white/5 backdrop-blur-md rounded-3xl shadow-2xl p-8 md:p-12 border border-white/10 ring-1 ring-white/5">
        <header className="mb-10 text-center">
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4">
            Prepare Your Session
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
            Provide the details for your mock interview. Gemini will research the person and the company to give you the most authentic experience possible.
          </p>
        </header>

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">JD Link (LinkedIn, Indeed, etc.)</label>
              <input 
                type="url" 
                placeholder="https://linkedin.com/jobs/view/..."
                className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-white placeholder:text-gray-600 transition-all"
                value={jdLink}
                onChange={e => setJdLink(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Interviewer Name / LinkedIn</label>
              <input 
                type="text" 
                placeholder="e.g. Hiring Manager at Google"
                className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-white placeholder:text-gray-600 transition-all"
                value={interviewerName}
                onChange={e => setInterviewerName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Job Description Content</label>
            <textarea 
              className="w-full h-48 px-5 py-4 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-white placeholder:text-gray-600 transition-all"
              placeholder="Paste the full job description text here..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="md:col-span-2 bg-white/5 rounded-2xl p-6 border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Target Answer Time</span>
                <span className="text-indigo-400 font-mono font-bold text-lg">{timeLimit} min</span>
              </div>
              <input 
                type="range" min="1" max="5" step="0.5"
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                value={timeLimit}
                onChange={e => setTimeLimit(Number(e.target.value))}
              />
            </div>
            
            <div className="flex flex-col gap-4">
              {user && (
                <button 
                  onClick={handleSaveProfile}
                  disabled={!content && !interviewerName}
                  className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border transition-all font-bold text-sm ${
                    saveConfirmation 
                    ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  } disabled:opacity-30`}
                >
                  {saveConfirmation ? (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg> Saved to Account</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg> Save Profile</>
                  )}
                </button>
              )}
              
              {!user && (
                <div className="text-[10px] text-gray-600 text-center font-bold uppercase tracking-widest">Login to save profiles</div>
              )}
            </div>
          </div>

          <button 
            onClick={() => handleStart()}
            disabled={isResearching || !content}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg py-5 rounded-2xl shadow-2xl shadow-indigo-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isResearching ? (
              <><span className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" /> Deep Researching Role & Persona...</>
            ) : (
              <>
                Launch Professional Simulation 
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;

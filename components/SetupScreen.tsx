
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { JobDescription, InterviewSettings, ResearchedPersona } from '../types';

interface SetupScreenProps {
  onStart: (jd: JobDescription, settings: InterviewSettings, persona: ResearchedPersona | null) => void;
  onResearchStart: () => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onStart, onResearchStart }) => {
  const [content, setContent] = useState('');
  const [jdLink, setJdLink] = useState('');
  const [interviewerName, setInterviewerName] = useState('');
  const [timeLimit, setTimeLimit] = useState(2);
  const [isResearching, setIsResearching] = useState(false);

  const handleStart = async () => {
    setIsResearching(true);
    onResearchStart();

    const apiKey = process.env.API_KEY;
    if (!apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    let finalTitle = "Candidate";
    let researchedPersona: ResearchedPersona | null = null;

    try {
      // Step 1: Research Persona & Role
      const researchPrompt = `
        Research Task:
        1. JOB LINK: ${jdLink || 'Not provided'}
        2. INTERVIEWER: ${interviewerName || 'Unknown'}
        3. RAW JD TEXT: ${content.substring(0, 2000)}

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
      { title: finalTitle, content, link: jdLink, interviewerInfo: interviewerName },
      { timeLimitSeconds: timeLimit * 60 },
      researchedPersona
    );
    setIsResearching(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in pb-12">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl p-8 border border-white/20">
        <header className="mb-8">
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">MockMate AI</h1>
          <p className="text-gray-500 mt-2">Next-gen interview simulation with deep persona research.</p>
        </header>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">JD Link (Optional)</label>
              <input 
                type="url" 
                placeholder="https://linkedin.com/jobs/..."
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={jdLink}
                onChange={e => setJdLink(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Interviewer Name/LinkedIn</label>
              <input 
                type="text" 
                placeholder="e.g. Satya Nadella or Jane Doe, HR at Google"
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={interviewerName}
                onChange={e => setInterviewerName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Full Job Description</label>
            <textarea 
              className="w-full h-48 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder="Paste the raw text here for deeper context..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          <div className="bg-indigo-50 rounded-2xl p-6">
             <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-indigo-900 uppercase tracking-tight">Answer Time Limit</span>
                <span className="text-indigo-600 font-mono font-bold">{timeLimit} min</span>
             </div>
             <input 
                type="range" min="1" max="10" step="0.5"
                className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                value={timeLimit}
                onChange={e => setTimeLimit(Number(e.target.value))}
             />
          </div>

          <button 
            onClick={handleStart}
            disabled={isResearching}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isResearching ? (
              <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deep Researching Role & Persona...</>
            ) : (
              <>Launch Interview Simulation <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;

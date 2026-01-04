
import React, { useEffect, useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { FeedbackReport, JobDescription, TranscriptItem } from '../types';

interface FeedbackScreenProps {
  transcript: TranscriptItem[];
  jobDescription: JobDescription;
  onRestart: () => void;
}

const FeedbackScreen: React.FC<FeedbackScreenProps> = ({ transcript, jobDescription, onRestart }) => {
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const generateFeedback = async () => {
        if (!transcript || transcript.length === 0) {
            if (isMounted) {
                setError("No interview transcript found to analyze.");
                setLoading(false);
            }
            return;
        }

        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            if (isMounted) {
                setError("API Key is missing. Please ensure your environment is configured correctly.");
                setLoading(false);
            }
            return;
        }

        const ai = new GoogleGenAI({ apiKey });
        const transcriptText = transcript.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');

        const prompt = `
        Role: Expert Interview Coach & Technical Recruiter.
        
        Context:
        Job Title: ${jobDescription.title}
        Job Description: ${jobDescription.content}

        Transcript of Mock Interview:
        ${transcriptText}

        Task: Analyze the candidate's performance and generate a structured feedback report.

        CRITICAL INSTRUCTIONS:
        1. **Identify Q&A Pairs**: Group the transcript into distinct Question & Answer pairs. 
        2. **Extract Question Text**: For the 'question' field, include the specific question asked by the interviewer.
        3. **Generate Sample Outstanding Answer**: For 'modelAnswer', write a VERBATIM, first-person example of a perfect answer. 

        Output JSON matching this schema:
        {
            overallScore: number (0-10),
            summary: string,
            sections: [
                {
                    question: string,
                    userAnswerSummary: string,
                    rating: number,
                    strengths: string[],
                    improvements: string[],
                    modelAnswer: string
                }
            ]
        }
        `;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            overallScore: { type: Type.NUMBER },
                            summary: { type: Type.STRING },
                            sections: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        question: { type: Type.STRING },
                                        userAnswerSummary: { type: Type.STRING },
                                        rating: { type: Type.NUMBER },
                                        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        modelAnswer: { type: Type.STRING }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (isMounted) {
                if (response.text) {
                    try {
                        const data = JSON.parse(response.text) as FeedbackReport;
                        setReport(data);
                    } catch (parseErr) {
                        console.error("JSON Parse Error:", parseErr);
                        setError("Failed to parse the AI's feedback. Please try again.");
                    }
                } else {
                    setError("The AI did not return a response. Please try again.");
                }
            }
        } catch (e: any) {
            console.error("Error generating feedback", e);
            if (isMounted) {
                setError(e?.message || "An unexpected error occurred during analysis.");
            }
        } finally {
            if (isMounted) {
                setLoading(false);
            }
        }
    };

    generateFeedback();
    
    return () => {
        isMounted = false;
    };
  }, [transcript, jobDescription]);

  if (loading) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-[#0f172a] rounded-3xl border border-white/5 shadow-2xl">
              <div className="relative w-20 h-20 mb-8">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h2 className="text-3xl font-black text-white mb-3">Analyzing Performance</h2>
              <p className="text-gray-400 max-w-sm leading-relaxed">Our AI coach is reviewing your transcript and drafting sample responses. This usually takes a few seconds.</p>
          </div>
      );
  }

  if (error || !report) {
      return (
          <div className="max-w-xl mx-auto text-center py-20 px-8 bg-red-500/5 rounded-3xl border border-red-500/20">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Analysis Failed</h2>
              <p className="text-gray-400 mb-8">{error || "Could not generate report."}</p>
              <button 
                onClick={onRestart} 
                className="bg-white text-gray-900 px-8 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors shadow-lg"
              >
                Go Back to Setup
              </button>
          </div>
      )
  }

  return (
    <div className="max-w-5xl mx-auto bg-white/5 backdrop-blur-md rounded-3xl shadow-2xl border border-white/10 overflow-hidden animate-fade-in mb-12">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-10 md:p-14 border-b border-white/5">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="bg-indigo-600/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-500/20">Executive Summary</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4">
                  Session Analysis
                </h1>
                <p className="text-gray-400 text-lg leading-relaxed max-w-2xl italic">
                  "{report.summary}"
                </p>
            </div>
            <div className="bg-white/5 rounded-3xl p-8 border border-white/10 text-center min-w-[180px] backdrop-blur-xl">
                <div className="text-6xl font-black text-indigo-400 tracking-tighter">{report.overallScore}<span className="text-2xl text-gray-600">/10</span></div>
                <div className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-500 mt-2">Overall Mastery</div>
            </div>
          </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="p-6 md:p-10 space-y-10">
          <div className="flex items-center gap-4 mb-2">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.3em]">Individual Question Breakdown</h3>
            <div className="h-px flex-1 bg-white/5"></div>
          </div>
          
          {report.sections?.map((section, idx) => (
              <div key={idx} className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden hover:border-indigo-500/30 transition-colors">
                  <div className="bg-white/[0.02] px-8 py-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                      <h4 className="font-bold text-white text-lg flex-1">
                          <span className="text-indigo-500 mr-3 opacity-50 font-mono">#{idx+1}</span> 
                          {section.question || "Follow-up Question"}
                      </h4>
                      <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                          section.rating >= 8 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                          section.rating >= 5 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                          Score: {section.rating}/10
                      </div>
                  </div>
                  <div className="p-8 space-y-8">
                      <div>
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-3">Your Response Summary</label>
                          <p className="text-gray-300 text-sm leading-relaxed bg-black/20 p-5 rounded-2xl border border-white/5 italic">
                            {section.userAnswerSummary}
                          </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="bg-green-500/[0.02] p-6 rounded-2xl border border-green-500/10">
                             <h5 className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-4 flex items-center">
                                 <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                 Strengths
                             </h5>
                             <ul className="space-y-3">
                                 {section.strengths?.map((s, i) => (
                                   <li key={i} className="flex gap-3 text-sm text-gray-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                                      {s}
                                   </li>
                                 ))}
                             </ul>
                          </div>
                          <div className="bg-indigo-500/[0.02] p-6 rounded-2xl border border-indigo-500/10">
                             <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center">
                                 <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                 Growth Areas
                             </h5>
                             <ul className="space-y-3">
                                 {section.improvements?.map((s, i) => (
                                   <li key={i} className="flex gap-3 text-sm text-gray-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                      {s}
                                   </li>
                                 ))}
                             </ul>
                          </div>
                      </div>

                      <div className="bg-indigo-600/10 rounded-2xl p-8 border border-indigo-500/20 relative group overflow-hidden">
                          <div className="absolute -top-4 -right-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
                          <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center">
                              <span className="mr-2">✨</span> Sample Outstanding Answer
                          </h5>
                          <div className="text-gray-200 text-md leading-relaxed font-serif pl-6 border-l-2 border-indigo-500/30">
                              {section.modelAnswer ? (
                                  <span className="relative">
                                    <span className="absolute -left-4 top-0 text-3xl text-indigo-500/30 font-serif leading-none">"</span>
                                    {section.modelAnswer}
                                    <span className="text-3xl text-indigo-500/30 font-serif leading-none">"</span>
                                  </span>
                              ) : (
                                  <span className="text-gray-600 italic">No sample answer generated.</span>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          ))}
      </div>
      
      <div className="p-10 bg-white/5 border-t border-white/5 flex justify-center">
          <button 
            onClick={onRestart}
            className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black px-10 py-5 rounded-2xl shadow-2xl shadow-indigo-500/20 transition-all active:scale-95"
          >
              Start New Simulation
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </button>
      </div>
    </div>
  );
};

export default FeedbackScreen;

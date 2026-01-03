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

  useEffect(() => {
    const generateFeedback = async () => {
        if (!transcript || transcript.length === 0) {
            setLoading(false);
            return;
        }

        const apiKey = process.env.API_KEY;
        if (!apiKey) return;

        const ai = new GoogleGenAI({ apiKey });

        // Format transcript for the prompt. Added safety check.
        const transcriptText = transcript?.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n') || '';

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
           - If the interviewer has multiple turns in a row (e.g., "Great." then "Tell me about X"), COMBINE them to form the full question. 
           - IGNORE trivial pleasantries if they don't lead to a question.
        2. **Extract Question Text**: For the 'question' field, include the specific question asked by the interviewer. **NEVER leave this empty.**
        3. **Generate Sample Outstanding Answer**: For 'modelAnswer', write a VERBATIM, first-person example of a perfect answer. 
           - It should be professional, concise (approx 100-150 words), and strictly tailored to the Job Description. 
           - Use the STAR method (Situation, Task, Action, Result) where applicable.
           - Do not describe *how* to answer; actually *write* the answer the candidate should have given.

        Output JSON matching this schema:
        {
            overallScore: number (0-10),
            summary: string (Professional executive summary),
            sections: [
                {
                    question: string (The actual question text),
                    userAnswerSummary: string (Brief summary of what the user said),
                    rating: number (1-10),
                    strengths: string[] (List of 2-3 strong points),
                    improvements: string[] (List of 2-3 specific actionable tips),
                    modelAnswer: string (The verbatim outstanding sample answer)
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

            if (response.text) {
                const data = JSON.parse(response.text) as FeedbackReport;
                setReport(data);
            }
        } catch (e) {
            console.error("Error generating feedback", e);
        } finally {
            setLoading(false);
        }
    };

    generateFeedback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-700">Analyzing your performance...</h2>
              <p className="text-gray-500 mt-2">Our AI coach is reviewing your answers and drafting sample responses.</p>
          </div>
      );
  }

  if (!report) {
      return (
          <div className="p-8 text-center">
              <h2 className="text-xl text-red-600">Could not generate report.</h2>
              <button onClick={onRestart} className="mt-4 text-indigo-600 hover:underline">Try Again</button>
          </div>
      )
  }

  return (
    <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden my-8">
      {/* Header */}
      <div className="bg-gray-900 text-white p-8">
          <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold mb-2">Interview Performance Report</h1>
                <p className="opacity-80">{jobDescription.title}</p>
            </div>
            <div className="text-center bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                <div className="text-4xl font-bold text-yellow-400">{report.overallScore}/10</div>
                <div className="text-xs uppercase tracking-wider mt-1">Overall Score</div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <p className="italic text-gray-300">"{report.summary}"</p>
          </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="p-8 space-y-8 bg-gray-50">
          <h3 className="text-xl font-bold text-gray-800 border-b pb-2">Question Analysis</h3>
          
          {report.sections?.map((section, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-white p-4 border-b border-gray-100 flex justify-between items-center">
                      <h4 className="font-bold text-gray-800 text-lg flex-1 mr-4">
                          <span className="text-indigo-600 mr-2">Q{idx+1}:</span> 
                          {section.question || "Follow-up Question"}
                      </h4>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap ${
                          section.rating >= 8 ? 'bg-green-100 text-green-700' : 
                          section.rating >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>
                          Rating: {section.rating}/10
                      </span>
                  </div>
                  <div className="p-6 space-y-6">
                      <div>
                          <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Answer Summary</h5>
                          <p className="text-gray-600 bg-gray-50 p-3 rounded-lg text-sm">{section.userAnswerSummary}</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                             <h5 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2 flex items-center">
                                 <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                 Strengths
                             </h5>
                             <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                 {section.strengths?.map((s, i) => <li key={i}>{s}</li>)}
                             </ul>
                          </div>
                          <div>
                             <h5 className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2 flex items-center">
                                 <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                 Areas for Improvement
                             </h5>
                             <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                 {section.improvements?.map((s, i) => <li key={i}>{s}</li>)}
                             </ul>
                          </div>
                      </div>

                      {/* Sample Outstanding Answer Section */}
                      <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                             <svg className="w-16 h-16 text-indigo-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                          </div>
                          <h5 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-3 flex items-center">
                              <span className="mr-2">✨</span> Sample Outstanding Answer
                          </h5>
                          <div className="text-gray-800 text-sm leading-relaxed font-medium relative z-10 pl-4 border-l-4 border-indigo-300">
                              {section.modelAnswer ? (
                                  <>"{section.modelAnswer}"</>
                              ) : (
                                  <span className="text-gray-400 italic">No sample answer generated.</span>
                              )}
                          </div>
                          <p className="text-xs text-indigo-400 mt-3 text-right">Generated by Gemini 3 Pro</p>
                      </div>
                  </div>
              </div>
          ))}
          {!report.sections?.length && (
             <div className="text-gray-500 text-center italic">No specific question analysis available.</div>
          )}
      </div>
      
      <div className="p-8 bg-white border-t">
          <button 
            onClick={onRestart}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-lg transition shadow-lg"
          >
              Start New Interview
          </button>
      </div>
    </div>
  );
};

export default FeedbackScreen;
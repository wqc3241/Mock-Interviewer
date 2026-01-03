
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';
import { TranscriptItem, JobDescription, ResearchedPersona } from '../types';

interface UseInterviewSessionProps {
  apiKey: string;
  jobDescription: JobDescription;
  persona: ResearchedPersona | null;
  onDisconnect: () => void;
}

export const useInterviewSession = ({ apiKey, jobDescription, persona, onDisconnect }: UseInterviewSessionProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [textBuffer, setTextBuffer] = useState('');
  const [audioContextSuspended, setAudioContextSuspended] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  
  const connectionStarted = useRef(false);
  const nudgeSent = useRef(false);
  const onDisconnectRef = useRef(onDisconnect);

  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);

  // Use refs for stable access to state-like JD and Persona data to avoid dependency-induced loops
  const jdRef = useRef(jobDescription);
  const personaRef = useRef(persona);
  useEffect(() => { jdRef.current = jobDescription; }, [jobDescription]);
  useEffect(() => { personaRef.current = persona; }, [persona]);

  const resumeAudio = useCallback(async () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (inputAudioContextRef.current && inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }
      setAudioContextSuspended(false);

      // Once user interacts and audio is active, nudge the model to start if it hasn't already
      if (sessionRef.current && !nudgeSent.current) {
        nudgeSent.current = true;
        // In Live API, we can nudge the model turn by sending a text-based input part
        sessionRef.current.sendRealtimeInput({ 
          text: "The candidate has entered the room and is ready. Please introduce yourself and begin the interview." 
        });
      }
    } catch (err) {
      console.error("Failed to resume audio context:", err);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey || connectionStarted.current) return;
    connectionStarted.current = true;

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      setAudioContextSuspended(outputCtx.state === 'suspended');
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const p = personaRef.current;
      const j = jdRef.current;

      const personaInstruction = p ? `
        ADOPT INTERVIEWER PERSONA:
        Name: ${p.name}
        Professional Style: ${p.style}
        Background: ${p.backgroundSummary}
        Company Context: ${p.companyVibe}
      ` : "Adopt a standard professional senior recruiter persona.";

      const sysInstruction = `
        ${personaInstruction}
        
        CONTEXT:
        Target Role: ${j.title}
        JD Content: ${j.content.substring(0, 500)}

        CRITICAL OPERATIONAL INSTRUCTIONS:
        1. **INITIATION**: You are the interviewer. You MUST start the conversation. Do not wait for the user to speak first. 
        2. **FIRST TURN**: Introduce yourself briefly and ask the first behavioral or technical question based on the JD.
        3. **PACING**: Be patient. Wait for the candidate to finish their response (at least 2 seconds of silence) before you reply.
        4. **INTERRUPTIONS**: If the user starts talking while you are speaking, STOP your audio output immediately.
        5. **LENGTH**: Keep your responses concise (under 3 sentences).
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: sysInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: p?.style.toLowerCase().includes('technical') ? 'Puck' : 'Fenrir' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            console.log("Live session connection established");
            setIsConnected(true);
            
            const session = await sessionPromise;
            sessionRef.current = session;

            // Setup microphone capture
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Volume visualization
              let sum = 0;
              for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              setCurrentVolume(Math.sqrt(sum / inputData.length));
              
              // Only stream input if we're not suspended (user has clicked start)
              if (outputCtx.state !== 'suspended') {
                sessionRef.current.sendRealtimeInput({ media: createBlob(inputData) });
              }
            };
            
            source.connect(processor);
            const silenceGain = inputCtx.createGain();
            silenceGain.gain.value = 0;
            processor.connect(silenceGain);
            silenceGain.connect(inputCtx.destination);

            // Trigger the model to speak if it hasn't started and context is already active
            if (outputCtx.state !== 'suspended' && !nudgeSent.current) {
              nudgeSent.current = true;
              session.sendRealtimeInput({ text: "Please begin the interview." });
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  setIsModelSpeaking(true);
                  try {
                    const audioBuffer = await decodeAudioData(base64ToUint8Array(part.inlineData.data), outputCtx, 24000, 1);
                    const source = outputCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputCtx.destination);
                    
                    const startTime = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                    source.start(startTime);
                    nextStartTimeRef.current = startTime + audioBuffer.duration;
                    
                    audioSourcesRef.current.add(source);
                    source.onended = () => {
                      audioSourcesRef.current.delete(source);
                      if (audioSourcesRef.current.size === 0) setIsModelSpeaking(false);
                    };
                  } catch (err) {
                    console.error("Playback error:", err);
                  }
                }
              }
            }

            if (msg.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += msg.serverContent.outputTranscription.text;
              setTextBuffer(currentOutputTranscriptionRef.current);
            }
            if (msg.serverContent?.inputTranscription) {
              currentInputTranscriptionRef.current += msg.serverContent.inputTranscription.text;
            }

            if (msg.serverContent?.turnComplete) {
              setTranscript(prev => {
                const newItems: TranscriptItem[] = [];
                if (currentInputTranscriptionRef.current.trim()) {
                  newItems.push({ role: 'user', text: currentInputTranscriptionRef.current.trim(), timestamp: Date.now() });
                  currentInputTranscriptionRef.current = '';
                }
                if (currentOutputTranscriptionRef.current.trim()) {
                  newItems.push({ role: 'model', text: currentOutputTranscriptionRef.current.trim(), timestamp: Date.now() });
                  currentOutputTranscriptionRef.current = '';
                  setTextBuffer('');
                }
                return [...prev, ...newItems];
              });
            }

            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelSpeaking(false);
              setTextBuffer('');
            }
          },
          onclose: () => {
            console.log("Live session closed");
            setIsConnected(false);
            connectionStarted.current = false;
            onDisconnectRef.current();
          },
          onerror: (e) => {
            console.error("Live session error:", e);
            setIsConnected(false);
            connectionStarted.current = false;
            onDisconnectRef.current();
          }
        }
      });
    } catch (e) {
      console.error("Connect failed:", e);
      connectionStarted.current = false;
      onDisconnectRef.current();
    }
  }, [apiKey]); // Dependency on apiKey only to keep the function stable

  const disconnect = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    [audioContextRef, inputAudioContextRef].forEach(ref => {
      if (ref.current && ref.current.state !== 'closed') ref.current.close();
    });
    setIsConnected(false);
    connectionStarted.current = false;
    nudgeSent.current = false;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, isModelSpeaking, currentVolume, transcript, textBuffer, audioContextSuspended, resumeAudio, disconnect };
};

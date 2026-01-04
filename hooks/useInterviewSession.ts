
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  
  const nudgeSent = useRef(false);
  const onDisconnectRef = useRef(onDisconnect);

  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);

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

      if (sessionRef.current && !nudgeSent.current) {
        nudgeSent.current = true;
        sessionRef.current.sendRealtimeInput({ 
          text: "The candidate has entered the room and is ready. Please introduce yourself and begin the interview." 
        });
      }
    } catch (err) {
      console.error("Failed to resume audio context:", err);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey || isConnecting || isConnected) return;
    
    setIsConnecting(true);
    setError(null);

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

      const sysInstruction = `
        ADOPT INTERVIEWER PERSONA:
        Name: ${p?.name || 'Recruiter'}
        Style: ${p?.style || 'Professional'}
        Context: ${p?.companyVibe || 'Corporate'}

        GOAL: Interview the candidate for the ${j.title} role.
        JD HIGHLIGHTS: ${j.content.substring(0, 300)}

        VOICE INTERACTION RULES:
        1. **START IMMEDIATELY**: Introduce yourself and ask the first question once nudged.
        2. **STAY IN CHARACTER**: Maintain your professional style.
        3. **WAIT FOR RESPONSE**: Be patient. Give the user space to speak.
        4. **CONCISION**: Keep turns short.
        5. **NO INTERRUPTIONS**: Do not cut the user off unless they have stopped speaking for a significant time.
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
            setIsConnecting(false);
            
            const session = await sessionPromise;
            sessionRef.current = session;

            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              
              let sum = 0;
              for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const vol = Math.sqrt(sum / inputData.length);
              setCurrentVolume(vol);
              
              const SILENCE_THRESHOLD = 0.005; 
              if (outputCtx.state !== 'suspended' && vol > SILENCE_THRESHOLD) {
                sessionRef.current.sendRealtimeInput({ media: createBlob(inputData) });
              }
            };
            
            source.connect(processor);
            const silenceGain = inputCtx.createGain();
            silenceGain.gain.value = 0;
            processor.connect(silenceGain);
            silenceGain.connect(inputCtx.destination);

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
            setIsConnecting(false);
          },
          onerror: (e: any) => {
            console.error("Live session error:", e);
            setIsConnected(false);
            setIsConnecting(false);
            setError(e?.message || "The service is currently unavailable. Please check your connection or try again later.");
          }
        }
      });
    } catch (e: any) {
      console.error("Connect failed:", e);
      setIsConnecting(false);
      setError(e?.message || "Connection failed.");
    }
  }, [apiKey]);

  const requestNewQuestion = useCallback(() => {
    if (!sessionRef.current || !isConnected) return;
    
    // 1. Manually stop current audio localy for instant feedback
    audioSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsModelSpeaking(false);
    setTextBuffer('');
    currentOutputTranscriptionRef.current = '';

    // 2. Send the signal to the model
    sessionRef.current.sendRealtimeInput({ 
      text: "I didn't like that question or it was inappropriate. Please discard it and ask a completely different, highly relevant interview question instead." 
    });
  }, [isConnected]);

  const disconnect = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    [audioContextRef, inputAudioContextRef].forEach(ref => {
      if (ref.current && ref.current.state !== 'closed') ref.current.close();
    });
    setIsConnected(false);
    setIsConnecting(false);
    nudgeSent.current = false;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { 
    isConnected, 
    isConnecting, 
    error, 
    isModelSpeaking, 
    currentVolume, 
    transcript, 
    textBuffer, 
    audioContextSuspended, 
    resumeAudio, 
    disconnect, 
    retry: connect,
    requestNewQuestion
  };
};

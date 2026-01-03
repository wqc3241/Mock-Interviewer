
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

  // Function to resume audio context on user gesture
  const resumeAudio = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
      setAudioContextSuspended(false);
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state === 'suspended') {
      await inputAudioContextRef.current.resume();
    }
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      setAudioContextSuspended(outputCtx.state === 'suspended');
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const personaInstruction = persona ? `
        ADOPT INTERVIEWER PERSONA:
        Name: ${persona.name}
        Style: ${persona.style}
        Background: ${persona.backgroundSummary}
        Company Vibe: ${persona.companyVibe}
        Goal: Interview the candidate for the ${jobDescription.title} role.
      ` : "Adopt a standard professional senior recruiter persona.";

      const sysInstruction = `
        ${personaInstruction}
        
        CONTEXT:
        Target Role: ${jobDescription.title}
        JD Snapshot: ${jobDescription.content.substring(0, 800)}

        OPERATIONAL PROTOCOL:
        1. **INITIATION**: You MUST speak immediately upon connection. Introduce yourself and ask the first question. Do not wait for user input.
        2. **TURN TAKING**: Be extremely patient. Wait for at least 1.5 seconds of silence before you respond to the candidate.
        3. **INTERRUPTIONS**: If you hear the user start speaking while you are talking, STOP immediately.
        4. **FEEDBACK**: Briefly acknowledge their answer before moving to your next question.
        5. **CONCISION**: Keep your turns short (max 3 sentences).
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: sysInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: persona?.style.toLowerCase().includes('technical') ? 'Puck' : 'Fenrir' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            console.log("Live session opened");
            setIsConnected(true);
            
            // Try to resume contexts
            if (outputCtx.state === 'suspended') await outputCtx.resume().catch(console.warn);
            if (inputCtx.state === 'suspended') await inputCtx.resume().catch(console.warn);
            setAudioContextSuspended(outputCtx.state === 'suspended');

            const session = await sessionPromise;
            sessionRef.current = session;

            // Start microphone streaming
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Volume for visualizer
              let sum = 0;
              for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              setCurrentVolume(Math.sqrt(sum / inputData.length));
              
              // Send PCM
              sessionRef.current.sendRealtimeInput({ media: createBlob(inputData) });
            };
            
            source.connect(processor);
            const silenceGain = inputCtx.createGain();
            silenceGain.gain.value = 0;
            processor.connect(silenceGain);
            silenceGain.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Process any model turn parts (usually audio)
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  setIsModelSpeaking(true);
                  if (outputCtx.state === 'suspended') await outputCtx.resume().catch(console.warn);
                  
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
                }
              }
            }

            // Handle Transcriptions
            if (msg.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += msg.serverContent.outputTranscription.text;
              setTextBuffer(currentOutputTranscriptionRef.current);
            }
            if (msg.serverContent?.inputTranscription) {
              currentInputTranscriptionRef.current += msg.serverContent.inputTranscription.text;
            }

            // Handle Turn Completion
            if (msg.serverContent?.turnComplete) {
              const items: TranscriptItem[] = [];
              if (currentInputTranscriptionRef.current.trim()) {
                items.push({ role: 'user', text: currentInputTranscriptionRef.current.trim(), timestamp: Date.now() });
                currentInputTranscriptionRef.current = '';
              }
              if (currentOutputTranscriptionRef.current.trim()) {
                items.push({ role: 'model', text: currentOutputTranscriptionRef.current.trim(), timestamp: Date.now() });
                currentOutputTranscriptionRef.current = '';
                setTextBuffer('');
              }
              if (items.length > 0) setTranscript(prev => [...prev, ...items]);
            }

            // Handle Interruptions
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
            onDisconnect();
          },
          onerror: (e) => {
            console.error("Live Session Error:", e);
            onDisconnect();
          }
        }
      });
    } catch (e) {
      console.error("Connection process failed:", e);
      onDisconnect();
    }
  }, [apiKey, jobDescription, persona, onDisconnect]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
       // Note: session.close() is standard if available, but here we cleanup contexts
    }
    [audioContextRef, inputAudioContextRef].forEach(ref => {
      if (ref.current && ref.current.state !== 'closed') ref.current.close();
    });
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, isModelSpeaking, currentVolume, transcript, textBuffer, audioContextSuspended, resumeAudio, disconnect };
};

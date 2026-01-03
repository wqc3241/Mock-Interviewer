
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  const connect = useCallback(async () => {
    if (!apiKey) return;

    try {
      // Model and Context Setup
      const ai = new GoogleGenAI({ apiKey });
      
      // Output Context (24kHz is standard for Gemini output)
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      
      // Input Context (16kHz is standard for Gemini input)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const personaInstruction = persona ? `
        ADOPT INTERVIEWER PERSONA:
        Name: ${persona.name}
        Professional Style: ${persona.style}
        Background Info: ${persona.backgroundSummary}
        Company Environment: ${persona.companyVibe}
        Topics to Probe: ${persona.keyTopics.join(', ')}
      ` : "Adopt a standard professional senior recruiter persona.";

      const sysInstruction = `
        ${personaInstruction}
        
        CONTEXT:
        Target Role: ${jobDescription.title}
        Company Context: ${persona?.companyVibe || 'Professional Industry'}
        JD Details: ${jobDescription.content.substring(0, 600)}

        CRITICAL OPERATIONAL INSTRUCTIONS:
        1. **START IMMEDIATELY**: You must speak FIRST. Introduce yourself as ${persona?.name || 'the interviewer'} and ask the very first interview question immediately upon connection.
        2. **NO INTERRUPTIONS**: Be extremely patient. Do not speak while the user is talking. Wait for at least 2 seconds of silence before responding.
        3. **NATURAL FLOW**: Acknowledge answers before moving to the next question.
        4. **BREVITY**: Keep responses under 3 sentences.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: sysInstruction,
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { 
                voiceName: persona?.style.toLowerCase().includes('technical') ? 'Puck' : 'Fenrir' 
              } 
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            setIsConnected(true);
            
            // Resume contexts as they often start 'suspended' due to browser policies
            if (outputCtx.state === 'suspended') await outputCtx.resume();
            if (inputCtx.state === 'suspended') await inputCtx.resume();

            sessionPromise.then(session => {
              const source = inputCtx.createMediaStreamSource(stream);
              const processor = inputCtx.createScriptProcessor(4096, 1, 1);
              
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Volume for visualizer
                let sum = 0;
                for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const vol = Math.sqrt(sum / inputData.length);
                setCurrentVolume(vol);
                
                // Send raw PCM data
                session.sendRealtimeInput({ media: createBlob(inputData) });
              };
              
              source.connect(processor);
              // Connection to destination is required for ScriptProcessor to fire, 
              // but we use a GainNode at 0 to prevent audio feedback/echo.
              const silenceGain = inputCtx.createGain();
              silenceGain.gain.value = 0;
              processor.connect(silenceGain);
              silenceGain.connect(inputCtx.destination);
            });
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (audioData && outputCtx) {
              if (outputCtx.state === 'suspended') await outputCtx.resume();
              setIsModelSpeaking(true);
              
              try {
                const audioBuffer = await decodeAudioData(base64ToUint8Array(audioData), outputCtx, 24000, 1);
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
                console.error("Audio decoding failed", err);
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
            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelSpeaking(false);
              setTextBuffer('');
            }
          },
          onclose: () => {
            setIsConnected(false);
            onDisconnect();
          },
          onerror: (e) => console.error("Session Error:", e)
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (e) {
      console.error("Connection failed:", e);
      onDisconnect();
    }
  }, [apiKey, jobDescription, persona, onDisconnect]);

  const disconnect = useCallback(() => {
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

  return { isConnected, isModelSpeaking, currentVolume, transcript, textBuffer, disconnect };
};

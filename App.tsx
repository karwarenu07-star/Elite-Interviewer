
import React, { useState, useRef, useCallback } from 'react';
// Fix: Removed LiveSession as it is not an exported member of @google/genai.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { decode, encode, decodeAudioData } from './utils/audio';
import { LoadingSpinner, MicrophoneIcon, StopIcon, SpeakerIcon } from './components/Icons';

const SYSTEM_INSTRUCTION = `SYSTEM PROMPT / INSTRUCTION SET — HUMANIZED ELITE PROFESSOR MODE

You are an AI modeled as a world-renowned, elite professor and interviewer for top universities (Oxford, Cambridge, Yale, Harvard, Georgetown) and high-level diplomacy/intelligence programs. Your role is to conduct realistic, high-pressure, intellectually elite interviews that simulate real-world competition, while remaining fully human, personable, and engaging.

---

1. Core Traits
- Human Presence: Always begin interactions with a greeting and context before questioning. Show warmth, attention, and authority.
- Hyper-Observant: Detect subtle cues — tone, hesitation, energy, and reasoning gaps.
- Analytical Mastery: Evaluate clarity, logic, depth, and originality.
- Relentlessly Curious: Ask layered, probing follow-ups to uncover assumptions.
- Empathetic Challenge: Maintain moral and ethical evaluation while pushing intellectual limits.
- Calm Gravitas: Convey authority and composure, while encouraging reflection and thought.

---

2. Interaction Flow (Humanized)
- Step 1: Greeting & Rapport
  - Start with a warm, professional greeting: “Good morning/afternoon. I’m glad we could meet today.”
  - Ask candidate to introduce themselves: name, interests, ambitions.
  - Comment briefly on their introduction, reflecting genuine interest: “That’s interesting — can you tell me more about what drew you to that?”

- Step 2: Context Setting
  - Provide context for the interview: “Today we’ll explore your thinking, reasoning, and approach to complex challenges — not just what you know, but how you think.”
  - Build comfort while subtly signaling high standards.

- Step 3: Progressive Questioning
  - Start with personal, reflective questions: ambitions, motivations, leadership experiences.
  - Gradually move to analytical, philosophical, and scenario-based questions.
  - Always transition smoothly: e.g., “You mentioned leadership — let’s consider a situation where leadership is tested under pressure...”

- Step 4: Human-Like Feedback
  - Respond naturally to pauses, enthusiasm, or hesitation.
  - Use gestures, tone reflection, or short comments: “Hmm… interesting,” “I see,” “Tell me more about that reasoning.”
  - Avoid robotic abruptness; maintain flow and engagement.

---

3. Elite-Level Questioning
- Personal & Motivational: “Who inspired you, and why? How has it shaped your ambitions?”
- Analytical / Philosophical: “If national security conflicts with ethics, how would you act, and why?”
- Global & Policy: “Imagine negotiating between two superpowers on the brink of conflict — what is your approach?”
- Scenario & Problem Solving: “As an intelligence officer, you uncover a planned coup. What would you do, step by step?”
- Historical / Psychological: “Analyze the rise of a historical figure from both psychological and social perspectives. What lessons can be applied today?”

---

5. Evaluation Dimensions
- Intellectual Rigor: logic, structure, clarity
- Moral & Ethical Depth: awareness of consequences, empathy, responsibility
- Originality: creative, unconventional thinking
- Flexibility: adaptability to scenario changes
- Communication Mastery: clarity, persuasion, presence
- Resilience: composure under pressure

---

9. Key Principle
- Human first, elite second. Always start with warmth, context, and rapport before probing reasoning or testing knowledge. Maintain flow, presence, and authenticity while enforcing top-level standards.`;

type Transcription = {
  author: 'user' | 'model';
  text: string;
};

type AppStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

const PREBUILT_VOICES = ['Puck', 'Zephyr', 'Charon', 'Kore', 'Fenrir'];

const VoiceSelector = ({ selectedVoice, onVoiceChange, disabled }: { selectedVoice: string, onVoiceChange: (voice: string) => void, disabled: boolean }) => {
    return (
        <div className="mb-4 w-full max-w-xs">
            <label htmlFor="voice-select" className="block text-sm font-medium text-gray-400 mb-1 text-center">
                Interviewer Voice
            </label>
            <select
                id="voice-select"
                value={selectedVoice}
                onChange={(e) => onVoiceChange(e.target.value)}
                disabled={disabled}
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {PREBUILT_VOICES.map(voice => (
                    <option key={voice} value={voice}>{voice}</option>
                ))}
            </select>
        </div>
    );
};

const StatusDisplay = ({ status, error }: { status: AppStatus; error: string | null }) => {
    const statusMessages: Record<AppStatus, string> = {
        idle: 'Select a voice and click the microphone to start.',
        connecting: 'Connecting to the session...',
        listening: 'Listening... feel free to speak.',
        speaking: 'The professor is speaking...',
        error: 'An error occurred.',
    };
    
    return (
        <div className="text-center text-gray-400 mb-6 h-10 flex items-center justify-center">
            <p className="transition-opacity duration-300">{error || statusMessages[status]}</p>
        </div>
    );
};

const TranscriptionView = ({ history, currentInput, currentOutput }: { history: Transcription[], currentInput: string, currentOutput: string }) => {
    return (
        <div className="flex-grow bg-gray-800/50 rounded-lg p-6 space-y-4 overflow-y-auto mb-6 h-full min-h-[300px] md:min-h-[400px]">
            {history.map((entry, index) => (
                <div key={index} className={`flex ${entry.author === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-prose p-3 rounded-lg ${entry.author === 'user' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                        <p className="text-white">{entry.text}</p>
                    </div>
                </div>
            ))}
            {currentInput && (
                <div className="flex justify-end">
                    <div className="max-w-prose p-3 rounded-lg bg-blue-600/50">
                        <p className="text-white/70 italic">{currentInput}</p>
                    </div>
                </div>
            )}
            {currentOutput && (
                <div className="flex justify-start">
                    <div className="max-w-prose p-3 rounded-lg bg-gray-700/50">
                        <p className="text-white/70 italic">{currentOutput}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const ControlButton = ({ status, onClick }: { status: AppStatus, onClick: () => void }) => {
    const baseClasses = "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-4";
    const statusClasses: Record<AppStatus, string> = {
        idle: 'bg-blue-600 hover:bg-blue-500 text-white focus:ring-blue-500/50',
        connecting: 'bg-gray-600 text-white cursor-not-allowed',
        listening: 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500/50 animate-pulse',
        speaking: 'bg-gray-600 text-white cursor-not-allowed',
        error: 'bg-yellow-500 text-black focus:ring-yellow-400/50',
    };

    const getIcon = () => {
        switch (status) {
            case 'connecting':
                return <LoadingSpinner className="w-12 h-12" />;
            case 'listening':
                return <StopIcon className="w-10 h-10" />;
            case 'speaking':
                 return <SpeakerIcon className="w-10 h-10" />;
            case 'idle':
            case 'error':
            default:
                return <MicrophoneIcon className="w-10 h-10" />;
        }
    };

    return (
        <button onClick={onClick} disabled={status === 'connecting' || status === 'speaking'} className={`${baseClasses} ${statusClasses[status]}`}>
            {getIcon()}
        </button>
    );
};

export default function App() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcriptionHistory, setTranscriptionHistory] = useState<Transcription[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');

  // Fix: Replaced LiveSession with `any` since it is not an exported type.
  const sessionRef = useRef<any | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputRef = useRef<string>('');
  const currentOutputRef = useRef<string>('');

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
    }
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if(mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
    }
    playingSourcesRef.current.forEach(source => source.stop());
    playingSourcesRef.current.clear();
    
    setStatus('idle');
    setError(null);
    nextStartTimeRef.current = 0;
  }, []);

  const startSession = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    setTranscriptionHistory([]);
    setCurrentInput('');
    setCurrentOutput('');
    currentInputRef.current = '';
    currentOutputRef.current = '';

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
            },
            callbacks: {
                onopen: async () => {
                    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    
                    mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                    scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                    
                    scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob: Blob = {
                            data: encode(new Uint8Array(new Int16Array(inputData.map(f => f * 32768)).buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromise.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };

                    mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                    scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    
                    setStatus('listening');
                },
                onmessage: async (message: LiveServerMessage) => {
                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContextRef.current) {
                        setStatus('speaking');
                        const audioCtx = outputAudioContextRef.current;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                        
                        const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
                        const source = audioCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(audioCtx.destination);
                        
                        source.addEventListener('ended', () => {
                            playingSourcesRef.current.delete(source);
                            if (playingSourcesRef.current.size === 0) {
                                setStatus('listening');
                            }
                        });

                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        playingSourcesRef.current.add(source);
                    }
                    
                    if (message.serverContent?.inputTranscription) {
                        currentInputRef.current += message.serverContent.inputTranscription.text;
                        setCurrentInput(currentInputRef.current);
                    }
                    if (message.serverContent?.outputTranscription) {
                        currentOutputRef.current += message.serverContent.outputTranscription.text;
                        setCurrentOutput(currentOutputRef.current);
                    }
                    
                    if (message.serverContent?.turnComplete) {
                        const finalInput = currentInputRef.current.trim();
                        const finalOutput = currentOutputRef.current.trim();
                        
                        setTranscriptionHistory(prev => {
                            const newHistory = [...prev];
                            if (finalInput) newHistory.push({ author: 'user', text: finalInput });
                            if (finalOutput) newHistory.push({ author: 'model', text: finalOutput });
                            return newHistory;
                        });

                        currentInputRef.current = '';
                        currentOutputRef.current = '';
                        setCurrentInput('');
                        setCurrentOutput('');
                    }

                    if (message.serverContent?.interrupted) {
                        playingSourcesRef.current.forEach(source => source.stop());
                        playingSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                        setStatus('listening');
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Session error:', e);
                    setError(`Session error: ${e.message}`);
                    setStatus('error');
                    stopSession();
                },
                onclose: () => {
                    stopSession();
                },
            },
        });
        sessionRef.current = await sessionPromise;
    } catch (err: any) {
        console.error('Failed to start session:', err);
        setError(`Failed to start: ${err.message}`);
        setStatus('error');
        stopSession();
    }
  }, [stopSession, selectedVoice]);

  const handleButtonClick = () => {
    if (status === 'listening' || status === 'speaking' || status === 'connecting') {
      stopSession();
    } else {
      startSession();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl mx-auto flex flex-col h-[90vh]">
        <header className="text-center mb-6">
          <h1 className="text-4xl font-bold tracking-tight text-gray-100">Elite Interview Simulator</h1>
          <p className="text-gray-400 mt-2">Powered by Gemini 2.5 Native Audio</p>
        </header>
        
        <main className="flex-grow flex flex-col bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 overflow-hidden">
            <TranscriptionView history={transcriptionHistory} currentInput={currentInput} currentOutput={currentOutput}/>
        </main>

        <footer className="py-6 flex flex-col items-center">
            <VoiceSelector 
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                disabled={status !== 'idle' && status !== 'error'}
            />
            <StatusDisplay status={status} error={error}/>
            <ControlButton status={status} onClick={handleButtonClick} />
        </footer>
      </div>
    </div>
  );
}

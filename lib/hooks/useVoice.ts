"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const silenceLimitMs = 30_000;
const silenceThreshold = 0.018;

export function useSpeechSynthesis() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback((message: unknown, lang = "en-US") => {
    const cleanMessage = safeVoiceText(message);
    if (!supported || !cleanMessage.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanMessage);
    utterance.lang = lang;
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    window.speechSynthesis.speak(utterance);
  }, [supported]);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, stop };
}

export function useSpeechRecognition(options: { lang?: string; onTranscript?: (transcript: string) => void; onFinalTranscript?: (transcript: string) => void } = {}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbacksRef = useRef(options);
  const [supported] = useState(() => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Speech recognition is unavailable in this browser. Use text input instead.");
      return false;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = callbacksRef.current.lang || "en-US" || navigator.language;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = safeVoiceText(result[0]?.transcript);
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      const cleanFinalText = finalText.trim();
      const cleanInterimText = interimText.trim();

      if (cleanFinalText) {
        setTranscript((current) => {
          const next = `${safeVoiceText(current)} ${cleanFinalText}`.trim();
          callbacksRef.current.onTranscript?.(next);
          callbacksRef.current.onFinalTranscript?.(next);
          return next;
        });
      }
      setInterimTranscript(cleanInterimText);
      if (cleanInterimText) callbacksRef.current.onTranscript?.(`${safeVoiceText(transcript)} ${cleanInterimText}`.trim());
    };
    recognition.onerror = (event) => {
      setError(event.error ? `Speech recognition error: ${event.error}` : "Speech recognition failed.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    setError(null);
    setListening(true);
    recognition.start();
    return true;
  }, [transcript]);

  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return { supported, listening, transcript, interimTranscript, error, start, stop, reset };
}

function safeVoiceText(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function useVoice(options: { onTranscript?: (transcript: string) => void; onFinalTranscript?: (transcript: string) => void; onSilence?: () => void } = {}) {
  const callbacksRef = useRef(options);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastSoundAtRef = useRef(0);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [recording, setRecording] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 48 }, () => 0));
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechRecognition(options);
  const synthesis = useSpeechSynthesis();

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const stop = useCallback(() => {
    speech.stop();
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    setRecording(false);
  }, [speech]);

  const startWaveformLoop = useCallback(() => {
    const tick = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(samples);
    const bars = 48;
    const bucket = Math.max(1, Math.floor(samples.length / bars));
    const next = Array.from({ length: bars }, (_, index) => {
      let sum = 0;
      for (let offset = 0; offset < bucket; offset += 1) {
        const sample = samples[index * bucket + offset] ?? 128;
        sum += Math.abs(sample - 128) / 128;
      }
      return Math.min(1, sum / bucket);
    });
    const average = next.reduce((sum, value) => sum + value, 0) / next.length;
    if (average > silenceThreshold) lastSoundAtRef.current = Date.now();
    if (Date.now() - lastSoundAtRef.current > silenceLimitMs) {
      callbacksRef.current.onSilence?.();
      stop();
      return;
    }
    setWaveform(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [stop]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture is unavailable. Use text input instead.");
      setPermission("denied");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission("granted");
      setError(null);
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      lastSoundAtRef.current = Date.now();
      setRecording(true);
      speech.start();
      startWaveformLoop();
      return true;
    } catch {
      setPermission("denied");
      setError("Microphone permission denied. Use text input instead.");
      setRecording(false);
      return false;
    }
  }, [speech, startWaveformLoop]);

  useEffect(() => stop, [stop]);

  return {
    supported: speech.supported && synthesis.supported,
    speechSupported: speech.supported,
    synthesisSupported: synthesis.supported,
    permission,
    recording,
    listening: speech.listening,
    transcript: speech.transcript,
    interimTranscript: speech.interimTranscript,
    waveform,
    error: error || speech.error,
    start,
    stop,
    reset: speech.reset,
    speak: synthesis.speak,
    stopSpeaking: synthesis.stop,
  };
}

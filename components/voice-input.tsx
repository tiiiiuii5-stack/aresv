"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useVoice } from "@/lib/hooks/useVoice";

type VoiceInputProps = {
  value: string;
  onChange: (value: string) => void;
  onAgentResponse?: (message: string) => void;
};

export function VoiceInput({ value, onChange, onAgentResponse }: VoiceInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [agentMessage, setAgentMessage] = useState("Hold spacebar or press the mic. I will turn speech into a build prompt.");
  const voice = useVoice({
    onTranscript: onChange,
    onFinalTranscript: (transcript) => {
      const response = responseForTranscript(transcript);
      setAgentMessage(response);
      onAgentResponse?.(response);
      voiceSpeakRef.current?.(response);
    },
    onSilence: () => {
      const response = "I stopped listening after silence. Add any missing users, actions, or data before building.";
      setAgentMessage(response);
      onAgentResponse?.(response);
      voiceSpeakRef.current?.(response);
    },
  });
  const voiceSpeakRef = useRef(voice.speak);

  useEffect(() => {
    voiceSpeakRef.current = voice.speak;
  }, [voice.speak]);

  const stopRecording = useCallback(() => {
    if (voice.recording) voice.stop();
  }, [voice]);

  const startRecording = useCallback(() => {
    if (!voice.recording) void voice.start();
  }, [voice]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      startRecording();
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      stopRecording();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startRecording, stopRecording]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(18,18,26,0.7)";
    context.fillRect(0, 0, width, height);

    const bars = voice.waveform;
    const gap = 3;
    const barWidth = Math.max(2, (width - gap * (bars.length - 1)) / bars.length);
    bars.forEach((value, index) => {
      const active = voice.recording;
      const barHeight = Math.max(4, value * height * 0.86);
      const x = index * (barWidth + gap);
      const y = (height - barHeight) / 2;
      context.fillStyle = active ? "#EAB308" : "#CBD5E1";
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, 5);
      context.fill();
    });
  }, [voice.waveform, voice.recording]);

  const status = voice.recording ? "Listening..." : voice.error ? "Voice fallback active" : voice.speechSupported ? "Voice ready" : "Text fallback active";
  const transcript = [value, voice.interimTranscript].filter(Boolean).join(" ");

  return (
    <div className={`vos-cell p-4 transition ${voice.recording ? "border-[rgb(var(--vos-risk))]" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--vos-text))]">{status}</p>
          <p className="mt-1 text-xs text-[rgb(var(--vos-text-muted))]">Hold spacebar to record. Release to stop.</p>
        </div>
        <button
          type="button"
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className={`grid h-12 w-12 place-items-center rounded-full border transition ${voice.recording ? "border-[rgb(var(--vos-risk))] text-[rgb(var(--vos-risk))]" : "border-[rgb(var(--vos-border))] text-[rgb(var(--vos-primary))]"}`}
          aria-label={voice.recording ? "Stop recording" : "Start recording"}
        >
          {voice.recording ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        </button>
      </div>

      <canvas ref={canvasRef} width={620} height={96} className="mt-4 h-20 w-full rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]" aria-label="Voice waveform" />

      <div className="mt-4 vos-cell p-3">
        <p className="vos-label text-[rgb(var(--vos-verified))]">Transcript</p>
        <p className="mt-2 min-h-[44px] text-sm leading-6 text-[rgb(var(--vos-text))]">{transcript || "Your spoken prompt will appear here."}</p>
      </div>

      <div className="mt-3 vos-cell p-3">
        <p className="vos-label">Nova says</p>
        <p className="mt-2 text-sm leading-6 text-[rgb(var(--vos-text-muted))]">{voice.error || agentMessage}</p>
      </div>
    </div>
  );
}

function responseForTranscript(transcript: string) {
  const hasUser = /\b(user|users|customer|client|admin|team|manager|staff|owner|member)\b/i.test(transcript);
  const hasAction = /\b(create|edit|delete|submit|book|buy|track|assign|move|deploy|generate|save|upload)\b/i.test(transcript);
  const hasData = /\b(data|record|database|client|deal|task|order|booking|file|history|schema)\b/i.test(transcript);
  if (!hasUser) return "Who are the real users? Name the person using this app every day.";
  if (!hasAction) return "What real actions must those users perform? Include create, edit, submit, move, or save behavior.";
  if (!hasData) return "What data should persist? Mention the records, relationships, or history this app owns.";
  return "Good prompt. I hear users, actions, and persistent data. You can build when ready.";
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import type { JobRecord } from "@/lib/api";

type AgentState = "waiting" | "thinking" | "building" | "success" | "error";

type AgentAvatarProps = {
  job?: JobRecord | null;
  message?: string;
  name?: string;
};

const stateVariants = {
  waiting: {
    scale: [1, 1.02, 1],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
  thinking: {
    opacity: [0.5, 1, 0.5],
    scale: [1, 1.04, 1],
    transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" },
  },
  building: {
    rotate: 360,
    transition: { duration: 2.6, repeat: Infinity, ease: "linear" },
  },
  success: {
    y: [0, -10, 0],
    scale: [1, 1.12, 1],
    transition: { duration: 0.7, ease: "easeOut" },
  },
  error: {
    x: [0, -8, 8, -6, 6, 0],
    transition: { duration: 0.55, ease: "easeInOut" },
  },
};

export function AgentAvatar({ job, message, name = "Nova" }: AgentAvatarProps) {
  const agentState = statusToAgentState(job?.status);
  const step = message || job?.currentStep || defaultMessage(agentState);
  const previousSpokenRef = useRef("");

  useEffect(() => {
    if (!("speechSynthesis" in window) || !step || previousSpokenRef.current === step) return;
    previousSpokenRef.current = step;
    const utterance = new SpeechSynthesisUtterance(step);
    utterance.lang = "en-US";
    utterance.rate = 0.96;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [step]);

  const face = useMemo(() => expressionFor(agentState), [agentState]);
  const faceFill =
    agentState === "error"
      ? "rgb(var(--vos-danger))"
      : agentState === "success"
        ? "rgb(var(--vos-verified))"
        : agentState === "building"
          ? "rgb(var(--vos-risk))"
          : "rgb(var(--vos-primary))";

  return (
    <div className="relative">
      <motion.div
        key={agentState}
        variants={stateVariants}
        animate={agentState}
        className={`relative grid h-24 w-24 place-items-center rounded-full border bg-[rgb(var(--vos-panel))] ${agentState === "error" ? "border-red-300/50" : agentState === "success" ? "border-emerald-300/50" : "border-[rgb(var(--vos-border-strong))]"}`}
      >
        {agentState === "building" ? <Orbit /> : null}
        <svg viewBox="0 0 120 120" className="h-20 w-20" role="img" aria-label={`${name} ${agentState}`}>
          <circle cx="60" cy="60" r="46" fill={faceFill} opacity="0.18" />
          <circle cx="60" cy="60" r="38" fill="#0A0A0F" stroke="rgba(248,250,252,.18)" />
          {face.brows}
          {face.eyes}
          {face.mouth}
        </svg>
      </motion.div>

      <AnimatePresence>
        {agentState === "success" ? <Confetti /> : null}
        <SpeechBubble key={step} name={name} message={step} />
      </AnimatePresence>
    </div>
  );
}

function SpeechBubble({ name, message }: { name: string; message: string }) {
  const [typed, setTyped] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let index = 0;
    const id = window.setInterval(() => {
      index += 1;
      setTyped(message.slice(0, index));
      if (index >= message.length) window.clearInterval(id);
    }, 24);
    const dismiss = window.setTimeout(() => setVisible(false), 5000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(dismiss);
    };
  }, [message]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      className="absolute left-20 top-2 z-10 w-64 vos-cell p-3 text-sm leading-6"
    >
      <p className="vos-label">{name}</p>
      <p className="mt-1 text-[rgb(var(--vos-text))]">{typed}<span className="ml-0.5 inline-block animate-pulse text-[rgb(var(--vos-primary))]">|</span></p>
    </motion.div>
  );
}

function statusToAgentState(status?: JobRecord["status"]): AgentState {
  if (!status || status === "queued") return status === "queued" ? "thinking" : "waiting";
  if (status === "running" || status === "generating") return "thinking";
  if (status === "building" || status === "deploying") return "building";
  if (status === "completed" || status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  return "waiting";
}

function defaultMessage(state: AgentState) {
  if (state === "thinking") return "I am reading the intent and recalling useful build patterns.";
  if (state === "building") return "I am generating, validating, and binding the runtime.";
  if (state === "success") return "Build complete. The live preview is ready.";
  if (state === "error") return "Something failed. I will surface the blocker so it can be repaired.";
  return "Tell me the users, actions, and data. I will turn it into software.";
}

function expressionFor(state: AgentState) {
  if (state === "success") {
    return {
      eyes: <>
        <path d="M36 52 Q44 62 52 52" fill="none" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
        <path d="M68 52 Q76 62 84 52" fill="none" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
      </>,
      brows: null,
      mouth: <path d="M42 76 Q60 90 78 76" fill="none" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />,
    };
  }
  if (state === "error") {
    return {
      eyes: <>
        <circle cx="44" cy="58" r="4" fill="#EF4444" />
        <circle cx="76" cy="58" r="4" fill="#EF4444" />
      </>,
      brows: <>
        <path d="M34 45 L52 50" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
        <path d="M86 45 L68 50" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
      </>,
      mouth: <path d="M46 82 Q60 72 74 82" fill="none" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />,
    };
  }
  if (state === "thinking") {
    return {
      eyes: <>
        <path d="M38 57 H52" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />
        <path d="M68 57 H82" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />
      </>,
      brows: <>
        <path d="M36 47 H54" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
        <path d="M66 47 H84" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
      </>,
      mouth: <path d="M50 78 H70" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />,
    };
  }
  return {
    eyes: <>
      <circle cx="44" cy="56" r="5" fill="#F8FAFC" />
      <circle cx="76" cy="56" r="5" fill="#F8FAFC" />
    </>,
    brows: null,
    mouth: <path d="M48 78 Q60 84 72 78" fill="none" stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" />,
  };
}

function Orbit() {
  return (
    <motion.div className="absolute inset-[-8px] rounded-full border border-dashed border-amber-300/45" animate={{ rotate: 360 }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }} />
  );
}

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 12 }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-emerald-300"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos(index) * (38 + index * 4),
            y: Math.sin(index) * (34 + index * 3),
            opacity: 0,
            scale: 0.4,
          }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

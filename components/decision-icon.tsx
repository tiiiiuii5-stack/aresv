"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, FileText, Minus, ShieldAlert, ShieldCheck } from "lucide-react";

type DecisionIconName = "alert" | "arrow" | "check" | "circle" | "file" | "minus" | "shield-alert" | "shield-check";

export function DecisionIcon({ name, className = "" }: { name: DecisionIconName; className?: string }) {
  if (name === "alert") return <AlertTriangle className={className} />;
  if (name === "check") return <CheckCircle2 className={className} />;
  if (name === "circle") return <CircleDot className={className} />;
  if (name === "file") return <FileText className={className} />;
  if (name === "minus") return <Minus className={className} />;
  if (name === "shield-alert") return <ShieldAlert className={className} />;
  if (name === "shield-check") return <ShieldCheck className={className} />;
  return <ArrowRight className={className} />;
}

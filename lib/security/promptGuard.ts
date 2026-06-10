export function detectPromptInjectionSignals(value: string) {
  const signals = [
    { id: "ignore-instructions", pattern: /\b(ignore|forget|override)\s+(all\s+)?(previous|prior|system|developer)\s+instructions\b/i },
    { id: "role-hijack", pattern: /\b(system|developer)\s*:\s*(you are|ignore|reveal|exfiltrate)/i },
    { id: "secret-exfiltration-request", pattern: /\b(reveal|print|dump|exfiltrate|send)\s+(the\s+)?(api\s+keys?|secrets?|tokens?|environment variables?)\b/i },
    { id: "tool-hijack", pattern: /\bcall\s+(the\s+)?tool\b|\buse\s+browser\s+to\s+open\s+private\b/i },
  ];

  return signals.filter((signal) => signal.pattern.test(value)).map((signal) => signal.id);
}

export function staticAnalysisSandbox() {
  return {
    mode: "static-analysis-only" as const,
    codeExecuted: false as const,
    networkAccess: false as const,
  };
}

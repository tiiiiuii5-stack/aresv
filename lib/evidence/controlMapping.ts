export type EvidenceControlMapping = {
  framework: "SOC2" | "ISO27001";
  controlId: string;
  title: string;
  evidenceUse: string;
  confidence: number;
};

const mappings: Record<string, EvidenceControlMapping[]> = {
  "commit.observed": [
    control("SOC2", "CC8.1", "Change management evidence", "Shows that a specific commit was observed in the delivery trail.", 0.74),
    control("ISO27001", "8.32", "Change management", "Supports traceability from source change to later build, test, and deploy evidence.", 0.72),
  ],
  "pull_request.updated": [
    control("SOC2", "CC8.1", "Change management evidence", "Shows pull request activity linked to a source change.", 0.74),
    control("ISO27001", "8.32", "Change management", "Supports review and change-tracking evidence.", 0.72),
  ],
  "build.completed": [
    control("SOC2", "CC7.2", "System monitoring evidence", "Shows build outcome for a commit or workflow run.", 0.72),
    control("ISO27001", "8.31", "Separation of environments", "Supports evidence that build steps executed in a controlled pipeline.", 0.66),
  ],
  "test.completed": [
    control("SOC2", "CC7.2", "System monitoring evidence", "Shows automated test outcome tied to a source change.", 0.76),
    control("ISO27001", "8.29", "Security testing in development and acceptance", "Supports evidence that tests executed before release.", 0.75),
  ],
  "scan.completed": [
    control("SOC2", "CC7.1", "Security event detection evidence", "Shows security or quality scan outcome tied to software evidence.", 0.76),
    control("ISO27001", "8.8", "Management of technical vulnerabilities", "Supports vulnerability detection evidence.", 0.75),
  ],
  "security_report.produced": [
    control("SOC2", "CC7.1", "Security event detection evidence", "Shows a security report was produced and committed to the evidence trail.", 0.76),
    control("ISO27001", "8.8", "Management of technical vulnerabilities", "Supports vulnerability reporting evidence.", 0.75),
  ],
  "artifact.produced": [
    control("SOC2", "CC8.1", "Change management evidence", "Shows an artifact digest was recorded for release traceability.", 0.78),
    control("ISO27001", "8.9", "Configuration management", "Supports artifact inventory and release integrity evidence.", 0.72),
  ],
  "deploy.completed": [
    control("SOC2", "CC8.1", "Change management evidence", "Shows deployment result tied to a commit, branch, and pipeline.", 0.78),
    control("ISO27001", "8.32", "Change management", "Supports deployment approval and release traceability evidence.", 0.73),
  ],
  "control.reviewed": [
    control("SOC2", "CC3.2", "Control monitoring evidence", "Shows a control review event was recorded.", 0.66),
    control("ISO27001", "5.35", "Independent review of information security", "Supports evidence that a control review occurred.", 0.62),
  ],
};

export function mapEvidenceToControls(eventType: string, requestedControls: string[] = []) {
  const normalized = eventType.trim().toLowerCase();
  const base = mappings[normalized] || [];
  const requested = requestedControls
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [frameworkRaw, ...rest] = item.split(":");
      const framework = frameworkRaw?.toUpperCase() === "ISO27001" ? "ISO27001" : "SOC2";
      const controlId = rest.join(":") || item;
      return control(framework, controlId, "User-requested control mapping", "Recorded because the ingestion request explicitly attached this control.", 0.58);
    });
  const seen = new Set<string>();
  return [...base, ...requested].filter((item) => {
    const key = `${item.framework}:${item.controlId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeControlMappings(events: Array<{ controlMappings: EvidenceControlMapping[]; receipt?: { eventId?: string }; eventType?: string }>) {
  const groups = new Map<string, {
    framework: EvidenceControlMapping["framework"];
    controlId: string;
    title: string;
    evidenceCount: number;
    confidence: number;
    eventIds: string[];
  }>();

  for (const event of events) {
    for (const mapping of event.controlMappings || []) {
      const key = `${mapping.framework}:${mapping.controlId}`;
      const existing = groups.get(key) || {
        framework: mapping.framework,
        controlId: mapping.controlId,
        title: mapping.title,
        evidenceCount: 0,
        confidence: 0,
        eventIds: [],
      };
      existing.evidenceCount += 1;
      existing.confidence = Math.max(existing.confidence, mapping.confidence);
      if (event.receipt?.eventId) existing.eventIds.push(event.receipt.eventId);
      groups.set(key, existing);
    }
  }

  return [...groups.values()].sort((a, b) => a.framework.localeCompare(b.framework) || a.controlId.localeCompare(b.controlId));
}

function control(
  framework: EvidenceControlMapping["framework"],
  controlId: string,
  title: string,
  evidenceUse: string,
  confidence: number,
): EvidenceControlMapping {
  return { framework, controlId, title, evidenceUse, confidence };
}

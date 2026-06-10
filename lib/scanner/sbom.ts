import { createHash } from "node:crypto";

export type SbomComponent = {
  name: string;
  version: string | null;
  ecosystem: "npm" | "python";
  scope: "runtime" | "development" | "unknown";
  sourceFile: string;
  purl: string;
};

export type RepositorySbom = {
  format: "ventureos-sbom";
  version: "1.0.0";
  generatedAt: string;
  componentCount: number;
  ecosystems: string[];
  hash: string;
  components: SbomComponent[];
};

export function buildRepositorySbom(files: Array<{ path: string; content: string }>): RepositorySbom {
  const components = [
    ...npmComponents(files),
    ...pythonComponents(files),
  ].sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name) || String(a.version || "").localeCompare(String(b.version || "")));

  return {
    format: "ventureos-sbom",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    componentCount: components.length,
    ecosystems: [...new Set(components.map((component) => component.ecosystem))].sort(),
    hash: sha256(JSON.stringify(components.map((component) => [component.ecosystem, component.name, component.version, component.scope, component.sourceFile]))),
    components,
  };
}

function npmComponents(files: Array<{ path: string; content: string }>): SbomComponent[] {
  const output: SbomComponent[] = [];
  for (const file of files.filter((item) => /(^|\/)package\.json$/i.test(item.path))) {
    const json = parseJson(file.content);
    if (!json) continue;
    for (const [name, version] of Object.entries(stringRecord(json.dependencies))) {
      output.push(component("npm", name, version, "runtime", file.path));
    }
    for (const [name, version] of Object.entries(stringRecord(json.devDependencies))) {
      output.push(component("npm", name, version, "development", file.path));
    }
  }
  return output;
}

function pythonComponents(files: Array<{ path: string; content: string }>): SbomComponent[] {
  const output: SbomComponent[] = [];
  for (const file of files.filter((item) => /(^|\/)requirements(?:-[A-Za-z0-9_.-]+)?\.txt$/i.test(item.path))) {
    for (const line of file.content.split("\n")) {
      const clean = line.replace(/#.*/, "").trim();
      if (!clean || clean.startsWith("-")) continue;
      const match = clean.match(/^([A-Za-z0-9_.-]+)(?:==([^;\s]+))?/);
      if (!match?.[1]) continue;
      output.push(component("python", match[1], match[2] || null, "runtime", file.path));
    }
  }
  return output;
}

function component(ecosystem: SbomComponent["ecosystem"], name: string, version: unknown, scope: SbomComponent["scope"], sourceFile: string): SbomComponent {
  const cleanName = name.trim();
  const cleanVersion = typeof version === "string" && version.trim() && !/^(workspace:|\*|latest)$/i.test(version.trim())
    ? version.trim().replace(/^[~^]/, "")
    : null;
  return {
    name: cleanName,
    version: cleanVersion,
    ecosystem,
    scope,
    sourceFile,
    purl: cleanVersion
      ? `pkg:${ecosystem}/${encodeURIComponent(cleanName)}@${encodeURIComponent(cleanVersion)}`
      : `pkg:${ecosystem}/${encodeURIComponent(cleanName)}`,
  };
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item === "string")) as Record<string, string>;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

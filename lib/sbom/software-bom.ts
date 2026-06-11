import { createHash } from "node:crypto";

export type SbomDependencyScope = "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";

export type SoftwareBillOfMaterialsComponent = {
  name: string;
  version: string;
  scope: SbomDependencyScope;
  manifestPath: string;
  packageManager: string;
  purl: string;
  bomRef: string;
};

export type SoftwareBillOfMaterialsEvidence = {
  engine: "ventureos-built-in-sbom";
  version: "1.0.0";
  format: "CycloneDX";
  specVersion: "1.5";
  generatedAt: string;
  sourceHash: string;
  bomHash: string;
  status: "available" | "partial" | "not_found";
  completeness: "none" | "limited" | "moderate";
  manifestCount: number;
  componentCount: number;
  directDependencyCount: number;
  devDependencyCount: number;
  packageManagers: string[];
  riskFlags: string[];
  limitations: string[];
  componentsPreview: SoftwareBillOfMaterialsComponent[];
  cyclonedx: Record<string, unknown>;
};

type GenerateSoftwareBillOfMaterialsInput = {
  sourceCode: string;
  appName: string;
  repositoryUrl?: string;
  generatedAt?: string;
};

type SourceFile = {
  path: string;
  content: string;
};

const dependencyScopes: SbomDependencyScope[] = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

export function generateSoftwareBillOfMaterials(input: GenerateSoftwareBillOfMaterialsInput): SoftwareBillOfMaterialsEvidence {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const files = splitSourceFiles(input.sourceCode);
  const manifestFiles = files.filter((file) => /(^|\/)package\.json$/i.test(file.path)).slice(0, 20);
  const lockfilePresent = files.some((file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i.test(file.path));
  const sourceHash = sha256(input.sourceCode);
  const components = dedupeComponents(manifestFiles.flatMap((file) => componentsFromPackageJson(file)));
  const packageManagers = packageManagersFor(manifestFiles);
  const directDependencyCount = components.filter((component) => component.scope === "dependencies" || component.scope === "peerDependencies" || component.scope === "optionalDependencies").length;
  const devDependencyCount = components.filter((component) => component.scope === "devDependencies").length;
  const status = components.length > 0 ? "available" : manifestFiles.length > 0 ? "partial" : "not_found";
  const riskFlags = riskFlagsFor({ components, manifestFiles, lockfilePresent });
  const limitations = limitationsFor({ status, lockfilePresent });
  const completeness = completenessFor({ status, lockfilePresent, components });

  const baseCycloneDx = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: generatedAt,
      tools: [
        {
          vendor: "VentureOS",
          name: "built-in dependency manifest extractor",
          version: "1.0.0",
        },
      ],
      component: {
        type: "application",
        name: input.appName || "Software Asset",
        version: "unknown",
        ...(input.repositoryUrl ? { externalReferences: [{ type: "vcs", url: input.repositoryUrl }] } : {}),
      },
      properties: [
        { name: "ventureos:sourceHash", value: sourceHash },
        { name: "ventureos:evidenceScope", value: "submitted-source-manifests" },
      ],
    },
    components: components.map((component) => ({
      type: "library",
      name: component.name,
      version: component.version,
      purl: component.purl,
      "bom-ref": component.bomRef,
      scope: component.scope === "devDependencies" ? "excluded" : "required",
      properties: [
        { name: "ventureos:dependencyScope", value: component.scope },
        { name: "ventureos:manifestPath", value: component.manifestPath },
        { name: "ventureos:packageManager", value: component.packageManager },
      ],
    })),
  };
  const preliminaryHash = sha256(canonicalStringify(baseCycloneDx));
  const cyclonedx = {
    ...baseCycloneDx,
    serialNumber: `urn:uuid:${uuidFromHash(preliminaryHash)}`,
  };
  const bomHash = sha256(canonicalStringify(cyclonedx));

  return {
    engine: "ventureos-built-in-sbom",
    version: "1.0.0",
    format: "CycloneDX",
    specVersion: "1.5",
    generatedAt,
    sourceHash,
    bomHash,
    status,
    completeness,
    manifestCount: manifestFiles.length,
    componentCount: components.length,
    directDependencyCount,
    devDependencyCount,
    packageManagers,
    riskFlags,
    limitations,
    componentsPreview: components.slice(0, 25),
    cyclonedx,
  };
}

export function sbomExternalEvidenceSource(sbom: SoftwareBillOfMaterialsEvidence) {
  return {
    id: "sbom",
    label: "SBOM dependency inventory",
    status: sbom.status === "not_found" ? "unavailable" : "available",
    evidence:
      sbom.status === "not_found"
        ? "No supported dependency manifest was observed in submitted evidence."
        : `${sbom.componentCount} component(s) extracted from ${sbom.manifestCount} package manifest(s). SBOM hash ${shortHash(sbom.bomHash)}.`,
    checkedAt: sbom.generatedAt,
  };
}

function splitSourceFiles(sourceCode: string): SourceFile[] {
  const lines = sourceCode.replace(/\r\n/g, "\n").split("\n");
  const files: SourceFile[] = [];
  let currentPath = "submitted-source.txt";
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\/\/ FILE:\s*(.+?)\s*$/);
    if (match) {
      if (currentLines.length) files.push({ path: currentPath, content: currentLines.join("\n") });
      currentPath = normalizePath(match[1] || "submitted-source.txt");
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length) files.push({ path: currentPath, content: currentLines.join("\n") });
  return files;
}

function componentsFromPackageJson(file: SourceFile): SoftwareBillOfMaterialsComponent[] {
  const manifest = parseJsonObject(file.content);
  if (!manifest) return [];
  const packageManager = packageManagerFor(manifest);
  const components: SoftwareBillOfMaterialsComponent[] = [];
  for (const scope of dependencyScopes) {
    const dependencies = objectValue(manifest[scope]);
    for (const [name, version] of Object.entries(dependencies)) {
      const cleanName = String(name || "").trim();
      const cleanVersion = String(version || "").trim();
      if (!cleanName || !cleanVersion) continue;
      components.push({
        name: cleanName,
        version: cleanVersion,
        scope,
        manifestPath: file.path,
        packageManager,
        purl: packageUrlFor(cleanName, cleanVersion),
        bomRef: `pkg:${sha256(`${file.path}:${scope}:${cleanName}:${cleanVersion}`).slice(0, 20)}`,
      });
    }
  }
  return components;
}

function packageManagersFor(files: SourceFile[]) {
  const managers = files.map((file) => packageManagerFor(parseJsonObject(file.content) || {}));
  return [...new Set(managers.filter(Boolean))].slice(0, 5);
}

function packageManagerFor(manifest: Record<string, unknown>) {
  const declared = String(manifest.packageManager || "").trim().toLowerCase();
  if (declared.startsWith("pnpm@")) return "pnpm";
  if (declared.startsWith("yarn@")) return "yarn";
  if (declared.startsWith("bun@")) return "bun";
  return "npm";
}

function dedupeComponents(components: SoftwareBillOfMaterialsComponent[]) {
  const byKey = new Map<string, SoftwareBillOfMaterialsComponent>();
  for (const component of components) {
    const key = `${component.name}:${component.scope}:${component.version}`;
    if (!byKey.has(key)) byKey.set(key, component);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
}

function riskFlagsFor(input: { components: SoftwareBillOfMaterialsComponent[]; manifestFiles: SourceFile[]; lockfilePresent: boolean }) {
  const flags: string[] = [];
  if (!input.manifestFiles.length) {
    flags.push("No package manifest was observed; dependency inventory is incomplete.");
    return flags;
  }
  if (!input.components.length) flags.push("Package manifest was observed, but no dependency sections were found.");
  if (!input.lockfilePresent) flags.push("Lockfile evidence was not included; transitive dependency versions could not be confirmed.");
  if (input.components.length > 75) flags.push("Large dependency surface observed; supply-chain review should be prioritized.");
  if (input.components.some((component) => rangedVersion(component.version))) flags.push("Ranged dependency specs observed; exact installed versions require lockfile or build evidence.");
  return flags;
}

function limitationsFor(input: { status: SoftwareBillOfMaterialsEvidence["status"]; lockfilePresent: boolean }) {
  const limitations = ["Built-in SBOM extraction is based on submitted manifests only; it does not execute package managers or inspect deployed containers."];
  if (input.status === "not_found") limitations.push("No supported package manifest was present in the submitted evidence.");
  if (!input.lockfilePresent) limitations.push("Transitive dependencies and exact resolved versions require lockfile, build artifact, or CI-generated SBOM evidence.");
  return limitations;
}

function completenessFor(input: { status: SoftwareBillOfMaterialsEvidence["status"]; lockfilePresent: boolean; components: SoftwareBillOfMaterialsComponent[] }): SoftwareBillOfMaterialsEvidence["completeness"] {
  if (input.status === "not_found") return "none";
  if (input.lockfilePresent && input.components.length > 0) return "moderate";
  return "limited";
}

function packageUrlFor(name: string, version: string) {
  const encodedName = name.startsWith("@")
    ? name.split("/").map((part) => encodeURIComponent(part)).join("/")
    : encodeURIComponent(name);
  const exact = exactVersion(version);
  return exact ? `pkg:npm/${encodedName}@${encodeURIComponent(exact)}` : `pkg:npm/${encodedName}?requested=${encodeURIComponent(version)}`;
}

function exactVersion(value: string) {
  const clean = value.trim();
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(clean)) return "";
  return clean;
}

function rangedVersion(value: string) {
  return /[\^~*xX<>|]|\b(latest|workspace|file|link|git)\b/i.test(value);
}

function parseJsonObject(value: string) {
  try {
    return objectValue(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "").trim() || "submitted-source.txt";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function uuidFromHash(hash: string) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function shortHash(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

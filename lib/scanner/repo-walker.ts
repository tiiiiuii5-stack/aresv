import fs from "node:fs";
import path from "node:path";

export type RepositoryWalkFile = {
  path: string;
  absolutePath: string;
  size: number;
  content: string;
};

export type RepositoryWalkResult = {
  root: string;
  totalFilesDiscovered: number;
  filesLoaded: number;
  files: RepositoryWalkFile[];
  source: string;
  warnings: string[];
};

type WalkRepositorySourceInput = {
  rootDir: string;
  maxFileBytes?: number;
  maxTotalBytes?: number;
};

const ignoredDirectories = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "generated-apps",
  "tmp",
  "temp",
  "logs",
]);

const ignoredFilePattern = /\.(png|jpg|jpeg|gif|webp|ico|zip|pdf|lockb|woff2?|ttf|eot|mp4|mov|avi|bin|wasm|map)$/i;
const sourceFilePattern = /\.(ts|tsx|js|jsx|mjs|cjs|json|prisma|md|mdx|yml|yaml|toml|sql|css|scss|html|txt)$/i;

export function walkRepositorySource(input: WalkRepositorySourceInput): RepositoryWalkResult {
  const root = path.resolve(input.rootDir);
  const maxFileBytes = Math.max(1_000, Math.min(input.maxFileBytes || 500_000, 2_000_000));
  const maxTotalBytes = Math.max(maxFileBytes, Math.min(input.maxTotalBytes || 10_000_000, 50_000_000));
  const discovered = getAllRepositoryFiles(root);
  const files: RepositoryWalkFile[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;

  for (const absolutePath of discovered) {
    const stat = fs.statSync(absolutePath);
    if (stat.size > maxFileBytes) {
      warnings.push(`Skipped large file ${relativeRepositoryPath(root, absolutePath)} (${stat.size} bytes).`);
      continue;
    }
    if (totalBytes + stat.size > maxTotalBytes) {
      warnings.push(`Stopped reading files after reaching ${maxTotalBytes.toLocaleString()} bytes.`);
      break;
    }
    const content = fs.readFileSync(absolutePath, "utf8");
    if (!isTextContent(content)) continue;
    const relativePath = relativeRepositoryPath(root, absolutePath);
    files.push({
      path: relativePath,
      absolutePath,
      size: stat.size,
      content,
    });
    totalBytes += Buffer.byteLength(content, "utf8");
  }

  return {
    root,
    totalFilesDiscovered: discovered.length,
    filesLoaded: files.length,
    files,
    source: files.map((file) => `// FILE: ${file.path}\n${file.content}`).join("\n\n"),
    warnings,
  };
}

export function getAllRepositoryFiles(rootDir: string, fileList: string[] = []): string[] {
  const root = path.resolve(rootDir);
  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      getAllRepositoryFiles(absolutePath, fileList);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoredFilePattern.test(entry.name)) continue;
    if (!sourceFilePattern.test(entry.name) && !specialSourceFile(entry.name)) continue;
    fileList.push(absolutePath);
  }

  return fileList.sort((left, right) => left.localeCompare(right));
}

function specialSourceFile(fileName: string) {
  return /^(Dockerfile|Procfile|\.env\.example|\.env\.sample|vercel\.json)$/i.test(fileName);
}

function relativeRepositoryPath(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function isTextContent(value: string) {
  if (!value.trim()) return false;
  if (value.includes("\u0000")) return false;
  const suspicious = value.slice(0, 1000).match(/[\u0001-\u0008\u000E-\u001F]/g);
  return !suspicious || suspicious.length < 8;
}

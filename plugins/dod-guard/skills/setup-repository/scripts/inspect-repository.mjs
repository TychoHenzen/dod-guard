#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".next",
  ".nyc_output",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  ".vs",
  ".vscode",
  "__pycache__",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "target",
  "vendor",
]);

const MANIFEST_NAMES = new Set([
  "CMakeLists.txt",
  "Cargo.toml",
  "Gemfile",
  "Package.swift",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "go.mod",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
]);

const MANIFEST_EXTENSIONS = new Set([".csproj", ".fsproj", ".sln", ".vbproj"]);

const LANGUAGE_BY_EXTENSION = new Map([
  [".c", "C/C++"],
  [".cc", "C/C++"],
  [".cpp", "C/C++"],
  [".cs", ".NET"],
  [".fs", ".NET"],
  [".go", "Go"],
  [".h", "C/C++"],
  [".hpp", "C/C++"],
  [".java", "Java/Kotlin"],
  [".js", "JavaScript/TypeScript"],
  [".jsx", "JavaScript/TypeScript"],
  [".kt", "Java/Kotlin"],
  [".kts", "Java/Kotlin"],
  [".php", "PHP"],
  [".py", "Python"],
  [".rb", "Ruby"],
  [".rs", "Rust"],
  [".sh", "Shell"],
  [".swift", "Swift"],
  [".ts", "JavaScript/TypeScript"],
  [".tsx", "JavaScript/TypeScript"],
  [".vb", ".NET"],
]);

const NON_SOURCE_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".json",
  ".jsonc",
  ".lock",
  ".md",
  ".svg",
  ".toml",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const CONFIG_NAMES = new Set([
  ".actionlint.yaml",
  ".actionlint.yml",
  ".editorconfig",
  ".gitignore",
  ".markdownlint.json",
  ".markdownlint.yaml",
  ".markdownlint.yml",
  "biome.json",
  "biome.jsonc",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.ts",
  "jest.config.js",
  "jest.config.mjs",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "ruff.toml",
  "tsconfig.json",
  "uv.lock",
  "yarn.lock",
]);

const INSTRUCTION_NAMES = new Set(["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md"]);
const SAFE_SECRET_EXAMPLES = /(?:^|[._-])(?:example|sample|template)(?:[._-]|$)/i;
const SUSPICIOUS_SECRET_FILE = /(?:^|\/)(?:\.env(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\..+)?|secrets?(?:\..+)?|.+\.(?:key|pem|p12|pfx))$/i;
const TEXT_LIMIT_BYTES = 1024 * 1024;

const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ["github-token", /\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
];

function relative(root, file) {
  const value = path.relative(root, file);
  return value.length === 0 ? "." : value.split(path.sep).join("/");
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const groups = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const fullPath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) return [];
      return collectFiles(root, fullPath);
    }
    return entry.isFile() ? [fullPath] : [];
  }));
  return groups.flat();
}

async function runGit(root, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
    };
  }
}

async function inspectGit(root) {
  const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout !== "true") {
    return { repository: false, hasCommits: false, branch: null, remotes: [] };
  }

  const [head, branch, remotes] = await Promise.all([
    runGit(root, ["rev-parse", "--verify", "HEAD"]),
    runGit(root, ["branch", "--show-current"]),
    runGit(root, ["remote", "-v"]),
  ]);

  return {
    repository: true,
    hasCommits: head.ok,
    branch: branch.stdout || null,
    remotes: remotes.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        return match ? { name: match[1], url: match[2], direction: match[3] } : { raw: line };
      }),
  };
}

function sourceExtension(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension) return extension;
  return null;
}

async function credentialFindingsForFile(root, file) {
  const findings = [];
  const fileRelative = relative(root, file);
  const fileStats = await stat(file);
  if (SUSPICIOUS_SECRET_FILE.test(fileRelative) && !SAFE_SECRET_EXAMPLES.test(path.basename(file))) {
    findings.push({ file: fileRelative, line: null, signal: "secret-like-filename" });
  }
  if (fileStats.size > TEXT_LIMIT_BYTES) return findings;

  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return findings;
  }
  if (content.includes("\0")) return findings;

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const [signal, pattern] of SECRET_PATTERNS) {
      if (pattern.test(lines[index])) {
        findings.push({ file: fileRelative, line: index + 1, signal });
      }
    }
  }

  return findings;
}

async function credentialFindings(root, files) {
  const findings = (await Promise.all(files.map((file) => credentialFindingsForFile(root, file)))).flat();
  return findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
}

function isManifest(file) {
  return MANIFEST_NAMES.has(path.basename(file)) || MANIFEST_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export async function inspectRepository(rootPath) {
  const root = path.resolve(rootPath);
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new Error(`Project root is not a directory: ${root}`);

  const files = await collectFiles(root);
  const relativeFiles = files.map((file) => relative(root, file));
  const sourceExtensions = new Map();
  const languageSignals = new Map();
  const unclassifiedSourceExtensions = new Set();

  for (const file of relativeFiles) {
    const extension = sourceExtension(file);
    if (!extension) continue;
    sourceExtensions.set(extension, (sourceExtensions.get(extension) ?? 0) + 1);
    const language = LANGUAGE_BY_EXTENSION.get(extension);
    if (language) {
      const evidence = languageSignals.get(language) ?? [];
      evidence.push(file);
      languageSignals.set(language, evidence);
    } else if (!NON_SOURCE_EXTENSIONS.has(extension)) {
      unclassifiedSourceExtensions.add(extension);
    }
  }

  return {
    root,
    git: await inspectGit(root),
    files: relativeFiles,
    manifests: relativeFiles.filter(isManifest),
    configurations: relativeFiles.filter((file) =>
      CONFIG_NAMES.has(path.basename(file)) || file.startsWith(".github/workflows/")),
    instructions: relativeFiles.filter((file) => INSTRUCTION_NAMES.has(path.basename(file))),
    sourceExtensions: Object.fromEntries([...sourceExtensions].sort(([a], [b]) => a.localeCompare(b))),
    languageSignals: Object.fromEntries([...languageSignals].sort(([a], [b]) => a.localeCompare(b))),
    unclassifiedSourceExtensions: [...unclassifiedSourceExtensions].sort(),
    credentialFindings: await credentialFindings(root, files),
  };
}

export function assessGitHubSnapshot(snapshot) {
  const blockers = [];
  const openProjects = (snapshot.projects ?? []).filter((project) => !project.closed);
  if (openProjects.length !== 1) {
    blockers.push(`expected exactly one open linked Project, found ${openProjects.length}`);
  }

  if (openProjects.length === 1) {
    const options = openProjects[0].statusOptions ?? [];
    for (const required of ["Backlog", "Todo", "In Progress", "Done"]) {
      const count = options.filter((option) => option.toLowerCase() === required.toLowerCase()).length;
      if (count !== 1) blockers.push(`expected one ${required} status, found ${count}`);
    }
  }

  const checks = snapshot.checks ?? [];
  if (checks.length === 0) blockers.push("no required check results were supplied");
  for (const check of checks) {
    if (check.conclusion !== "SUCCESS") blockers.push(`check ${check.name} concluded ${check.conclusion ?? "unknown"}`);
  }

  const uniqueCheckNames = [...new Set(checks.map((check) => check.name).filter(Boolean))].sort();
  if (uniqueCheckNames.length !== checks.length) blockers.push("required check names are missing or duplicated");

  return {
    readyForProtection: blockers.length === 0,
    blockers,
    requiredChecks: uniqueCheckNames,
    protectionPayload: blockers.length === 0 ? {
      required_status_checks: { strict: true, contexts: uniqueCheckNames },
      enforce_admins: true,
      required_pull_request_reviews: {},
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
      lock_branch: false,
      allow_fork_syncing: false,
    } : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotIndex = args.indexOf("--github-snapshot");
  if (snapshotIndex !== -1) {
    if (args.length !== 2 || snapshotIndex !== 0) {
      throw new Error("Usage: inspect-repository.mjs --github-snapshot <snapshot.json>");
    }
    const snapshot = JSON.parse(await readFile(path.resolve(args[1]), "utf8"));
    process.stdout.write(`${JSON.stringify(assessGitHubSnapshot(snapshot), null, 2)}\n`);
    return;
  }

  if (args.length > 1) throw new Error("Usage: inspect-repository.mjs [project-root]");
  process.stdout.write(`${JSON.stringify(await inspectRepository(args[0] ?? process.cwd()), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

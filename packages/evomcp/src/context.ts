/**
 * Deterministic context curator for LLM prompt assembly.
 *
 * EvoStudio's 7-layer prompt assembly:
 *  1. GOAL — natural language task description
 *  2. STRATEGY — approach hint (simplest/robust/performant/…)
 *  3. TARGET FILES — content of files to modify
 *  4. DEPENDENCY GRAPH — imports, callers, callees
 *  5. CONSTRAINTS — lint rules, conventions, type config
 *  6. PRIOR ATTEMPTS — what was tried, why it failed
 *  7. FAILURE SIGNATURES — from memory bus, what to avoid
 *
 * SHA-256 content-addressed cache prevents redundant assembly.
 *
 * Evo-goals.md: "Every generation call gets a curated, minimal context
 * assembled by tools, never 'here's the whole repo.'"
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export interface ContextLayers {
  goal: string;
  strategy?: string;
  targetFiles?: TargetFileContent[];
  dependencyGraph?: DependencyInfo;
  constraints?: ConstraintInfo;
  priorAttempts?: AttemptSummary[];
  failureSignatures?: FailureSignature[];
}

export interface TargetFileContent {
  path: string;
  content: string;
  language?: string;
}

export interface DependencyInfo {
  imports: string[];
  callers: string[];
  callees: string[];
}

export interface ConstraintInfo {
  lintRules: string;
  conventions: string;
  typeConfig: string;
}

export interface AttemptSummary {
  strategy: string;
  outcome: "passed" | "failed" | "stuck";
  failureSignature?: string;
  summary: string;
}

export interface FailureSignature {
  hash: string;
  description: string;
  count: number;
}

export interface CuratedContext {
  /** The assembled system prompt text. */
  assembled: string;
  /** SHA-256 hash of the assembled text (for cache key). */
  hash: string;
  /** Estimated token count. */
  estimatedTokens: number;
  /** Which layers were included. */
  layersPresent: string[];
}

// ── Constants ──────────────────────────────────────────────────────────

const TOKENS_PER_CHAR = 0.25;
const MAX_ASSEMBLED_CHARS = 16_000; // ~4K tokens — keeps context tight

// ── Cache ──────────────────────────────────────────────────────────────

const assemblyCache = new Map<string, CuratedContext>();

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Assemble a curated context from the given layers.
 * Returns cached result if the same layers were assembled before.
 */
export function assembleContext(layers: ContextLayers): CuratedContext {
  const hash = hashLayers(layers);
  const cached = assemblyCache.get(hash);
  if (cached) return cached;

  const sections: string[] = [];
  const present: string[] = [];

  // Layer 1: GOAL
  if (layers.goal) {
    sections.push(`## Goal\n${layers.goal}`);
    present.push("goal");
  }

  // Layer 2: STRATEGY
  if (layers.strategy) {
    sections.push(`## Strategy\n${layers.strategy}`);
    present.push("strategy");
  }

  // Layer 3: TARGET FILES
  if (layers.targetFiles && layers.targetFiles.length > 0) {
    const fileText = layers.targetFiles
      .map((f) => {
        const lang = f.language ? ` (${f.language})` : "";
        const truncated = f.content.length > 4000 ? `${f.content.slice(0, 4000)}\n... [truncated]` : f.content;
        return `### ${f.path}${lang}\n\`\`\`\n${truncated}\n\`\`\``;
      })
      .join("\n\n");
    sections.push(`## Target Files\n${fileText}`);
    present.push("targetFiles");
  }

  // Layer 4: DEPENDENCY GRAPH
  if (layers.dependencyGraph) {
    const dg = layers.dependencyGraph;
    const parts: string[] = [];
    if (dg.imports.length > 0) parts.push(`Imports: ${dg.imports.join(", ")}`);
    if (dg.callers.length > 0) parts.push(`Callers: ${dg.callers.join(", ")}`);
    if (dg.callees.length > 0) parts.push(`Callees: ${dg.callees.join(", ")}`);
    if (parts.length > 0) {
      sections.push(`## Dependency Graph\n${parts.join("\n")}`);
      present.push("dependencyGraph");
    }
  }

  // Layer 5: CONSTRAINTS
  if (layers.constraints) {
    const c = layers.constraints;
    const parts: string[] = [];
    if (c.lintRules) parts.push(`Lint: ${c.lintRules.slice(0, 500)}`);
    if (c.conventions) parts.push(`Conventions: ${c.conventions.slice(0, 500)}`);
    if (c.typeConfig) parts.push(`Type: ${c.typeConfig.slice(0, 200)}`);
    if (parts.length > 0) {
      sections.push(`## Constraints\n${parts.join("\n")}`);
      present.push("constraints");
    }
  }

  // Layer 6: PRIOR ATTEMPTS
  if (layers.priorAttempts && layers.priorAttempts.length > 0) {
    const attemptText = layers.priorAttempts
      .map(
        (a, i) =>
          `### Attempt ${i + 1}: ${a.strategy} (${a.outcome})\n${a.summary}${a.failureSignature ? `\nFailure: ${a.failureSignature}` : ""}`,
      )
      .join("\n\n");
    sections.push(`## Prior Attempts\n${attemptText}`);
    present.push("priorAttempts");
  }

  // Layer 7: FAILURE SIGNATURES
  if (layers.failureSignatures && layers.failureSignatures.length > 0) {
    const sigText = layers.failureSignatures
      .map((s) => `- [${s.hash.slice(0, 8)}] (${s.count}x) ${s.description}`)
      .join("\n");
    sections.push(`## Failures to Avoid\n${sigText}`);
    present.push("failureSignatures");
  }

  let assembled = sections.join("\n\n");

  // Truncate if over budget
  if (assembled.length > MAX_ASSEMBLED_CHARS) {
    assembled = `${assembled.slice(0, MAX_ASSEMBLED_CHARS)}\n\n... [context truncated to token budget]`;
  }

  const result: CuratedContext = {
    assembled,
    hash,
    estimatedTokens: Math.ceil(assembled.length * TOKENS_PER_CHAR),
    layersPresent: present,
  };

  assemblyCache.set(hash, result);
  return result;
}

/**
 * Generate a fact sheet — a compact pinned block of conventions and
 * relevant interfaces from the working directory.
 *
 * Reads CLAUDE.md, biome.json, tsconfig.json from the project root
 * and distills them into ~200 tokens of pinned context.
 */
export function generateFactSheet(cwd: string): string {
  const parts: string[] = [];

  // CLAUDE.md — conventions
  const claudeMd = readIfExists(path.join(cwd, "CLAUDE.md"));
  if (claudeMd) {
    const lines = claudeMd.split("\n");
    // Extract only the most relevant sections
    const relevant = lines
      .filter((l) => /^[#-]|^\*/.test(l) && !/^#+\s/.test(l))
      .slice(0, 15)
      .join("\n");
    parts.push(`## Conventions\n${relevant.slice(0, 800)}`);
  }

  // biome.json — lint/formatter config
  const biomeJson = readIfExists(path.join(cwd, "biome.json"));
  if (biomeJson) {
    try {
      const cfg = JSON.parse(biomeJson);
      const indent = cfg?.formatter?.indentStyle ?? "space";
      const width = cfg?.formatter?.lineWidth ?? 120;
      parts.push(`## Format\nIndent: ${indent} (width: ${width})`);
    } catch {
      // ignore parse errors
    }
  }

  // tsconfig.json — type strictness
  const tsconfigJson = readIfExists(path.join(cwd, "tsconfig.json"));
  if (tsconfigJson) {
    try {
      const cfg = JSON.parse(tsconfigJson)?.compilerOptions ?? {};
      const strict = cfg.strict ? "strict" : "non-strict";
      const target = cfg.target ?? "es2022";
      parts.push(`## TypeScript\n${strict}, target=${target}`);
    } catch {
      // ignore
    }
  }

  // package.json — dependencies
  const packageJson = readIfExists(path.join(cwd, "package.json"));
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 10);
      parts.push(`## Dependencies\n${deps.join(", ")}`);
    } catch {
      // ignore
    }
  }

  return parts.join("\n\n");
}

/**
 * Build a dependency graph for a set of target files from their imports.
 * Lightweight — uses regex on file contents, not AST parsing.
 */
export function buildDependencyInfo(targetFiles: TargetFileContent[]): DependencyInfo {
  const imports = new Set<string>();
  const callees = new Set<string>();

  for (const f of targetFiles) {
    // Extract import paths
    const importRe = /(?:import|require)\s*\(?["']([^"']+)["']\)?/g;
    let match = importRe.exec(f.content);
    while (match !== null) {
      imports.add(match[1]);
      match = importRe.exec(f.content);
    }

    // Extract function/method calls (rough)
    const callRe = /\b([a-zA-Z_]\w{2,})\s*\(/g;
    match = callRe.exec(f.content);
    while (match !== null) {
      if (!isKeyword(match[1])) {
        callees.add(match[1]);
      }
      match = callRe.exec(f.content);
    }
  }

  return {
    imports: [...imports].slice(0, 30),
    callers: [], // caller detection requires graph — provided externally
    callees: [...callees].slice(0, 30),
  };
}

/**
 * Compact an array of target file info into the ContextLayers format.
 */
export function makeTargetFiles(files: { path: string; content: string }[], language?: string): TargetFileContent[] {
  return files.map((f) => ({
    path: f.path,
    content: f.content,
    language,
  }));
}

/**
 * Clear the assembly cache. Useful for testing.
 */
export function clearContextCache(): void {
  assemblyCache.clear();
}

// ── Internal helpers ───────────────────────────────────────────────────

function hashLayers(layers: ContextLayers): string {
  const canonical = JSON.stringify(
    {
      goal: layers.goal,
      strategy: layers.strategy,
      targetFiles: layers.targetFiles?.map((f) => ({ p: f.path, c: f.content.slice(0, 200) })),
      dependencyGraph: layers.dependencyGraph,
      constraints: layers.constraints,
      priorAttempts: layers.priorAttempts?.map((a) => ({ s: a.strategy, o: a.outcome, f: a.failureSignature })),
      failureSignatures: layers.failureSignatures?.map((s) => ({ h: s.hash, d: s.description })),
    },
    null,
    0,
  );
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function readIfExists(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    // ignore
  }
  return null;
}

const KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "return",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "async",
  "await",
  "yield",
  "import",
  "export",
  "default",
  "from",
  "function",
  "class",
  "const",
  "let",
  "var",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "super",
]);

function isKeyword(word: string): boolean {
  return KEYWORDS.has(word);
}

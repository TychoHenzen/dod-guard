import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";

export interface MissingTool {
  command: string;
  tool: string;
}

// ── cmd.exe builtins (not discoverable via `where`) ───────────────────────
const CMD_BUILTINS = new Set([
  "assoc",
  "break",
  "call",
  "cd",
  "chdir",
  "cls",
  "color",
  "copy",
  "date",
  "del",
  "dir",
  "echo",
  "endlocal",
  "erase",
  "exit",
  "for",
  "ftype",
  "goto",
  "if",
  "md",
  "mkdir",
  "mklink",
  "move",
  "path",
  "pause",
  "popd",
  "prompt",
  "pushd",
  "rd",
  "rem",
  "ren",
  "rename",
  "rmdir",
  "set",
  "setlocal",
  "shift",
  "start",
  "time",
  "title",
  "type",
  "ver",
  "verify",
  "vol",
]);

const OPERATOR_CHARS = new Set(["|", "&", ";", "(", ")", "`", "\n", "\r"]);

const WINDOWS_EQUIVALENTS: Record<string, string> = {
  grep: "findstr",
  cat: "type",
  ls: "dir",
  rm: "del  (or rmdir /s for dirs)",
  cp: "copy",
  mv: "move",
  touch: "type nul > file",
  which: "where",
  sed: "PowerShell -replace",
  awk: "PowerShell",
  head: "PowerShell Select-Object -First N",
  tail: "PowerShell Select-Object -Last N",
  test: "if exist / if defined",
  pwd: "cd",
  export: "set",
  diff: "fc",
  wc: "find /c",
};

// ── Token extraction ──────────────────────────────────────────────────────

function isQuote(c: string): c is '"' | "'" {
  return c === '"' || c === "'";
}

export function splitCommands(command: string): string[] {
  const segments: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;

  for (const c of command) {
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (isQuote(c)) {
      quote = c;
      buf += c;
      continue;
    }
    if (OPERATOR_CHARS.has(c)) {
      if (buf.trim()) segments.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim()) segments.push(buf);
  return segments;
}

function skipRedirection(s: string): string {
  let t = s.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (t[0] === ">" || t[0] === "<" || /^\d+>/.test(t)) {
      const m = t.match(/^\S+\s*/);
      t = (m ? t.slice(m[0].length) : t.slice(1)).trim();
      changed = true;
    }
  }
  return t;
}

function extractQuotedToken(s: string): { token: string | null; rest: string } {
  const q = s[0] as '"' | "'";
  const end = s.indexOf(q, 1);
  const token = end === -1 ? s.slice(1) : s.slice(1, end);
  return { token: token || null, rest: end === -1 ? "" : s.slice(end + 1) };
}

function extractBareToken(s: string): { token: string | null; rest: string } {
  const m = s.match(/^(\S+)\s*/);
  const token = m ? m[1] : s;
  const rest = m ? s.slice(m[0].length) : "";
  return { token, rest };
}

function isShellAssignment(s: string | null): boolean {
  if (!s) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(s);
}

function firstToken(segment: string): string | null {
  let s = skipRedirection(segment);
  while (s.length > 0) {
    if (isQuote(s[0])) {
      const r = extractQuotedToken(s);
      return r.token;
    }
    const r = extractBareToken(s);
    if (isShellAssignment(r.token)) {
      s = r.rest.trim();
      continue;
    }
    return r.token;
  }
  return null;
}

function hasAlnum(s: string): boolean {
  return /[A-Za-z0-9]/.test(s);
}

export function extractCommandNames(command: string): string[] {
  const names: string[] = [];
  for (const seg of splitCommands(command)) {
    const tok = firstToken(seg);
    // Skip bare fd-numbers (e.g. "1" in "2>&1") — never command names.
    if (tok && /^\d+$/.test(tok)) continue;
    if (tok && hasAlnum(tok) && !names.includes(tok)) names.push(tok);
  }
  return names;
}

// ── Glob detection ────────────────────────────────────────────────────────

const GLOB_CHARS = /[*?[]/;

/**
 * Check whether a command string contains unquoted glob wildcards.
 * cmd.exe does not expand globs — tools must accept literal paths.
 */
export function hasGlobWildcards(command: string): boolean {
  let quote: '"' | "'" | null = null;
  for (const c of command) {
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (GLOB_CHARS.test(c)) return true;
  }
  return false;
}

// ── Tool existence ────────────────────────────────────────────────────────

const existsCache = new Map<string, boolean>();

async function onPath(name: string): Promise<boolean> {
  try {
    if (isWindows) {
      await execFileAsync("where", [name], { timeout: 5000, windowsHide: true });
    } else {
      await execFileAsync("/bin/sh", ["-c", `command -v -- "${name}"`], { timeout: 5000 });
    }
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("command-check: tool existence check failed", { name, err: msg });
    return false;
  }
}

function looksLikePath(name: string): boolean {
  return name.includes("/") || name.includes("\\") || /^[A-Za-z]:/.test(name) || name.startsWith(".");
}

async function toolExists(name: string, cwd: string): Promise<boolean> {
  const key = `${isWindows ? name.toLowerCase() : name}|${cwd}`;
  const cached = existsCache.get(key);
  if (cached !== undefined) return cached;

  let ok: boolean;
  if (isWindows && CMD_BUILTINS.has(name.toLowerCase())) {
    ok = true;
  } else if (looksLikePath(name)) {
    ok = resolvePathExists(name, cwd);
  } else {
    ok = await onPath(name);
  }
  existsCache.set(key, ok);
  return ok;
}

function resolvePathExists(name: string, cwd: string): boolean {
  const base = path.isAbsolute(name) ? name : path.resolve(cwd, name);
  const candidates = isWindows ? [base, `${base}.exe`, `${base}.cmd`, `${base}.bat`] : [base];
  return candidates.some((p) => existsSync(p));
}

// ── Public API ────────────────────────────────────────────────────────────

export async function findMissingTools(commands: string[], cwd: string): Promise<MissingTool[]> {
  const missing: MissingTool[] = [];
  for (const command of commands) {
    const seen = new Set<string>();
    for (const name of extractCommandNames(command)) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (!(await toolExists(name, cwd))) missing.push({ command, tool: name });
    }
  }
  return missing;
}

export function suggestionFor(tool: string): string | undefined {
  return WINDOWS_EQUIVALENTS[tool.toLowerCase()];
}

// ── Glob expansion (Windows cmd.exe compatibility) ──────────────────────────

/**
 * Expand unquoted glob wildcards in a command string by reading the filesystem.
 * Only expands directory-level globs (e.g. `packages/{star}/src/`) — file-level globs
 * are left as-is since the target tool handles its own globbing.
 *
 * On Windows, cmd.exe does NOT expand globs in arguments. Tools like biome,
 * eslint, and prettier handle their own globbing, but shell commands (findstr,
 * type, dir) do not. This function bridges the gap for the common monorepo
 * pattern where `packages/{star}/src/` needs to become explicit paths.
 *
 * Returns the expanded command, or the original if no directory globs were found
 * or expansion failed.
 */
export function expandGlobsInCommand(command: string, cwd: string): { expanded: string; expanded_count: number } {
  if (process.platform !== "win32") return { expanded: command, expanded_count: 0 };

  // Only expand directory-level globs: <dir>/*/ or <dir>/*\  patterns
  // Match segments like "packages/*/src/" or "packages\*\src\"
  const dirGlobRe = /([A-Za-z0-9_.-]+)\\([*?][^\\]*)\\/g;
  const dirGlobReFwd = /([A-Za-z0-9_.-]+)\/([*?][^/]*)\//g;

  let expanded = command;
  let count = 0;

  // Resolve directory-level globs: readdir + wildcard match → explicit paths
  const globResolve = (re: RegExp, sep: "\\" | "/") => {
    const matches: { prefix: string; pattern: string; fullMatch: string }[] = [];
    for (const m of command.matchAll(re)) {
      matches.push({ prefix: m[1], pattern: m[2], fullMatch: m[0] });
    }
    for (const { prefix, pattern, fullMatch } of matches) {
      try {
        const parentDir = path.resolve(cwd, prefix);
        if (!existsSync(parentDir)) continue;

        const entries = readdirSync(parentDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .filter((name) => wildcardMatch(name, pattern))
          .sort();

        if (entries.length > 0) {
          const replacement = entries.map((e) => `${prefix}${sep}${e}${sep}`).join(" ");
          expanded = expanded.replace(fullMatch, replacement);
          count += entries.length;
        }
      } catch {
        // Directory doesn't exist or can't be read — leave glob as-is
      }
    }
  };

  globResolve(dirGlobRe, "\\");
  globResolve(dirGlobReFwd, "/");

  return { expanded, expanded_count: count };
}

/** Simple wildcard match: supports * (any chars) and ? (single char). */
function wildcardMatch(str: string, pattern: string): boolean {
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
  return re.test(str);
}

// ── Mutating command detection ──────────────────────────────────────────────

/**
 * Flags that modify files in-place. Proof commands using these dirty the
 * working tree, causing false failures in subsequent proof runs (#22, S7).
 *
 * Each entry: [flag, description] — flag may appear standalone or as part
 * of a tool name (e.g. `biome check --write` or `tsc` which writes dist/).
 */
const MUTATING_FLAGS: ReadonlyArray<[RegExp, string]> = [
  [/\bb(?:iome|eautifier)\b.*--write\b/, "biome/prettier --write modifies files in-place"],
  [/\beslint\b.*--fix\b/, "eslint --fix modifies files in-place"],
  [/\b(?:biome|prettier)\s+format\b(?!.*--check\b)/, "biome/prettier format (without --check) may modify files"],
  [/\btsc\b(?!.*--noEmit\b)/, "tsc writes compiled .js files to dist/ — use --noEmit for check-only"],
  [/\bstryker\b\s+run\b/, "Stryker mutates dist/ files in-place — use git checkout to restore after run"],
  [/\bgit\s+add\b/, "git add stages changes — never use in proof commands"],
  [/\bgit\s+commit\b/, "git commit creates commits — never use in proof commands"],
  [/\bgit\s+reset\b/, "git reset modifies working tree — never use in proof commands"],
  [/\brm\s+-[rf]/, "rm -rf deletes files — dangerous in proof commands"],
  [/\bdel\s+\/[sfq]/, "Windows del with flags deletes files — dangerous in proof commands"],
  [/\bnpm\s+(?:install|update|ci)\b/, "npm install/update/ci modifies node_modules/ and package-lock.json"],
  [/\bpnpm\s+(?:install|update)\b/, "pnpm install/update modifies node_modules/ and lockfile"],
  [/\bcargo\s+build\b(?!.*--check\b)/, "cargo build writes compiled artifacts (use cargo check for lint-only)"],
];

/**
 * Scan a command for mutating flags. Returns warnings for any detected
 * side-effect patterns. Proof commands should be side-effect-free — use
 * check-only equivalents (biome format, tsc --noEmit, eslint without --fix).
 */
export function detectMutatingFlags(command: string): string[] {
  const warnings: string[] = [];
  for (const [re, desc] of MUTATING_FLAGS) {
    if (re.test(command)) {
      warnings.push(desc);
    }
  }
  return warnings;
}

/** The platform commands are validated against (matches the checker's host). */
export const currentOs = process.platform;

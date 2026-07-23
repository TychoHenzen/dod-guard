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

// ── cmd.exe builtins ───────────────────────────────────────────────────────

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
  rm: "del (or rmdir /s for dirs)",
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
    if (tok && /^\d+$/.test(tok)) continue; // skip bare fd-numbers
    if (tok && hasAlnum(tok) && !names.includes(tok)) names.push(tok);
  }
  return names;
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
  } catch {
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

// ── Glob detection ────────────────────────────────────────────────────────

const GLOB_CHARS = /[*?[]/;

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

// ── Glob expansion (Windows cmd.exe compatibility) ────────────────────────

export function expandGlobsInCommand(command: string, cwd: string): { expanded: string; expanded_count: number } {
  if (process.platform !== "win32") return { expanded: command, expanded_count: 0 };

  const dirGlobRe = /([A-Za-z0-9_.-]+)\\([*?][^\\]*)\\/g;
  const dirGlobReFwd = /([A-Za-z0-9_.-]+)\/([*?][^/]*)\//g;

  let expanded = command;
  let count = 0;

  const globResolve = (re: RegExp, sep: "\\" | "/") => {
    const matches: { prefix: string; pattern: string; fullMatch: string }[] = [];
    for (const m of command.matchAll(re)) {
      matches.push({ prefix: m[1], pattern: m[2], fullMatch: m[0] });
    }
    const seen = new Set<string>();
    for (const { prefix, pattern, fullMatch } of matches) {
      if (seen.has(fullMatch)) continue;
      seen.add(fullMatch);
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
          expanded = expanded.split(fullMatch).join(replacement);
          count += entries.length;
        }
      } catch {
        /* directory missing — leave glob as-is */
      }
    }
  };

  globResolve(dirGlobRe, "\\");
  globResolve(dirGlobReFwd, "/");

  return { expanded, expanded_count: count };
}

function wildcardMatch(str: string, pattern: string): boolean {
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
  return re.test(str);
}

// ── Placeholder (no-op) detection ─────────────────────────────────────────

const PLACEHOLDER_PATTERNS: ReadonlyArray<RegExp> = [
  /^node\s+(?:-e|--eval)\s+["']?\s*process\.exit\s*\(\s*0\s*\)\s*["']?$/i,
  /^node\s+(?:-e|--eval)\s+["']\s*["']$/i,
  /^process\.exit\s*\(\s*0\s*\)$/i,
  /^echo\s+(?:ok|done|pass(?:ed)?)$/i,
  /^true$/,
  /^:\s*$/,
  /^exit\s+0$/i,
  /^exit\s+\/b\s+0$/i,
  /^cmd\s+\/c\s+["']?exit(?:\s+\/b)?\s+0["']?$/i,
  /^rem\b/i,
];

export function isPlaceholderCommand(command: string): boolean {
  const cmd = command.trim();
  if (!cmd) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(cmd));
}

export const currentOs = process.platform;

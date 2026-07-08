console.debug("find-functions: module loaded", { pid: process.pid });

// ── Function detection + cohesion analysis for brevity.ts ─────────────────

export interface FunctionRange {
  startLine: number;
  endLine: number;
  name: string;
  bodyLines: string[];
}

type Language = "js" | "py" | "rs" | "cs" | null;

// ── Block matching ────────────────────────────────────────────────────────

const CONTROL_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "catch", "try", "finally",
  "return", "throw", "new", "typeof", "instanceof", "class", "import", "export",
  "default", "from", "as", "yield", "await", "break", "continue", "with",
  "debugger", "void", "delete", "in", "of",
]);

function getIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

export function findBlockEnd(lines: string[], startIdx: number, open: string, close: string): number {
  const baseIndent = getIndent(lines[startIdx]);
  const openLine = lines[startIdx];
  let braceIdx = openLine.indexOf(open);
  if (braceIdx === -1) braceIdx = 0;
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let inString: string | null = null;
    const startCol = i === startIdx ? braceIdx : 0;
    for (let j = startCol; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j - 1] : "";
      if (inString) { if (ch === inString && prev !== "\\") inString = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
      if (ch === "/" && j + 1 < line.length && line[j + 1] === "/") break;
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0 && getIndent(line) <= baseIndent) return i; }
    }
  }
  return lines.length - 1;
}

// ── JS/TS ─────────────────────────────────────────────────────────────────

export function findJsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line)) continue;
    let m = line.match(/^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1, endLine: end + 1,
        name: m[1], bodyLines: lines.slice(i + 1, end),
      }); i = end; continue;
    }
    m = line.match(/^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{/);
    if (m && !CONTROL_KEYWORDS.has(m[1])) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1, endLine: end + 1,
        name: m[1], bodyLines: lines.slice(i + 1, end),
      }); i = end; continue;
    }
    m = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1, endLine: end + 1,
        name: m[1], bodyLines: lines.slice(i + 1, end),
      }); i = end; continue;
    }
    m = line.match(/^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1, endLine: end + 1,
        name: m[1], bodyLines: lines.slice(i + 1, end),
      }); i = end; continue;
    }
  }
  return out;
}

// ── Python ────────────────────────────────────────────────────────────────

export function findPyFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*def\s+(\w+)\s*\(/);
    if (!m) continue;
    const end = findPyBlockEnd(lines, i);
    if (end > i) {
      out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end + 1) });
      i = end;
    }
  }
  return out;
}

export function findPyBlockEnd(lines: string[], startIdx: number): number {
  const baseIndent = getIndent(lines[startIdx]);
  let i = startIdx + 1;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "") { i++; continue; }
    if (getIndent(lines[i]) <= baseIndent) return i - 1;
    i++;
  }
  return lines.length - 1;
}

// ── Rust ──────────────────────────────────────────────────────────────────

export function findRsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:pub(?:\s*\(\s*(?:crate|super|self)\s*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
    if (!m) continue;
    const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1, endLine: end + 1,
        name: m[1], bodyLines: lines.slice(i + 1, end),
      }); i = end; continue;
  }
  return out;
}

// ── C# ────────────────────────────────────────────────────────────────────

export function findCsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("//") || line.startsWith("[") || line.startsWith("/*")) continue;
    const m = line.match(
      /^(?:(?:public|private|protected|internal|static|virtual|override|async|sealed|abstract|unsafe|partial|readonly|extern)\s+)*(\w+(?:<[^>]*>)?)\s+(\w+)\s*\([^)]*\)\s*(?:where\s+[^{]+)?\{/,
    );
    if (!m) continue;
    const nameToken = m[2];
    if (CONTROL_KEYWORDS.has(nameToken)) continue;
    const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1, endLine: end + 1,
        name: nameToken, bodyLines: lines.slice(i + 1, end),
      }); i = end;
  }
  return out;
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export function findFunctions(lines: string[], lang: Language): FunctionRange[] {
  switch (lang) {
    case "js": return findJsFunctions(lines);
    case "py": return findPyFunctions(lines);
    case "rs": return findRsFunctions(lines);
    case "cs": return findCsFunctions(lines);
    default: return [];
  }
}

// ── Cohesion ──────────────────────────────────────────────────────────────

const SELECTION_RE: Record<string, RegExp> = {
  js: /\b(if\s*\(|else\s*if|else\s*\{|switch\s*\(|case\s+[^:]+:|ternary\?)/,
  py: /\b(if\s+|elif\s+|else\s*:|match\s+\w)/,
  rs: /\b(if\s+|else\s+if|else\s*\{|match\s+\w)/,
  cs: /\b(if\s*\(|else\s+if|else\s*\{|switch\s*\(|case\s+[^:]+:)/,
};

const ITERATION_RE: Record<string, RegExp> = {
  js: /\b(for\s*\(|while\s*\(|do\s*\{|\.forEach\s*\(|for\s+\([^)]*\s+of\s+|for\s+\([^)]*\s+in\s+)/,
  py: /\b(for\s+\w+\s+in\s+|while\s+\w)/,
  rs: /\b(for\s+\w+\s+in\s+|while\s+\w|loop\s*\{)/,
  cs: /\b(for\s*\(|foreach\s*\(|while\s*\(|do\s*\{)/,
};

function stripCommentsAndStrings(line: string): string {
  let s = line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
  s = s.replace(/`[^`]*`/g, "").replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return s;
}

function hasPattern(lines: string[], re: RegExp): boolean {
  for (const line of lines) {
    if (re.test(stripCommentsAndStrings(line))) return true;
  }
  return false;
}

export function checkCohesion(
  bodyLines: string[],
  lang: Language,
): { hasSelection: boolean; hasIteration: boolean; mixed: boolean } {
  if (!lang) return { hasSelection: false, hasIteration: false, mixed: false };
  const selRe = SELECTION_RE[lang];
  const iterRe = ITERATION_RE[lang];
  if (!selRe || !iterRe) return { hasSelection: false, hasIteration: false, mixed: false };
  const hasSelection = hasPattern(bodyLines, selRe);
  const hasIteration = hasPattern(bodyLines, iterRe);
  return { hasSelection, hasIteration, mixed: hasSelection && hasIteration };
}

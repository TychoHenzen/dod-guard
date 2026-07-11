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
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "catch",
  "try",
  "finally",
  "return",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "class",
  "import",
  "export",
  "default",
  "from",
  "as",
  "yield",
  "await",
  "break",
  "continue",
  "with",
  "debugger",
  "void",
  "delete",
  "in",
  "of",
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
      if (inString) {
        if (ch === inString && prev !== "\\") inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "/" && j + 1 < line.length && line[j + 1] === "/") break;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0 && getIndent(line) <= baseIndent) return i;
      }
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
        startLine: i + 1,
        endLine: end + 1,
        name: m[1],
        bodyLines: lines.slice(i + 1, end),
      });
      i = end;
      continue;
    }
    m = line.match(/^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{/);
    if (m && !CONTROL_KEYWORDS.has(m[1])) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1,
        endLine: end + 1,
        name: m[1],
        bodyLines: lines.slice(i + 1, end),
      });
      i = end;
      continue;
    }
    m = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1,
        endLine: end + 1,
        name: m[1],
        bodyLines: lines.slice(i + 1, end),
      });
      i = end;
      continue;
    }
    m = line.match(/^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      out.push({
        startLine: i + 1,
        endLine: end + 1,
        name: m[1],
        bodyLines: lines.slice(i + 1, end),
      });
      i = end;
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
    if (trimmed === "") {
      i++;
      continue;
    }
    if (getIndent(lines[i]) <= baseIndent) return i - 1;
    i++;
  }
  return lines.length - 1;
}

// ── Rust ──────────────────────────────────────────────────────────────────

export function findRsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      /^\s*(?:pub(?:\s*\(\s*(?:crate|super|self)\s*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/,
    );
    if (!m) continue;
    const end = findBlockEnd(lines, i, "{", "}");
    out.push({
      startLine: i + 1,
      endLine: end + 1,
      name: m[1],
      bodyLines: lines.slice(i + 1, end),
    });
    i = end;
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
      startLine: i + 1,
      endLine: end + 1,
      name: nameToken,
      bodyLines: lines.slice(i + 1, end),
    });
    i = end;
  }
  return out;
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export function findFunctions(lines: string[], lang: Language): FunctionRange[] {
  switch (lang) {
    case "js":
      return findJsFunctions(lines);
    case "py":
      return findPyFunctions(lines);
    case "rs":
      return findRsFunctions(lines);
    case "cs":
      return findCsFunctions(lines);
    default:
      return [];
  }
}

// ── Cyclomatic complexity + unnecessary else ─────────────────────────────

// Decision-point patterns per language for CC counting.
// Each occurrence adds 1 to the function's cyclomatic complexity.
const CC_PATTERNS: Record<string, RegExp[]> = {
  js: [
    /\bif\s*\(/g,
    /\belse\s+if\b/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcase\s+[^:]+:/g,
    /\bcatch\s*[({]/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
    /\?\./g,
    /\?[^:]+:/g, // ternary
  ],
  py: [/\bif\s+/g, /\belif\s+/g, /\bfor\s+/g, /\bwhile\s+/g, /\bexcept\s*:/g, /\band\b/g, /\bor\b/g],
  rs: [
    /\bif\s+/g,
    /\belse\s+if\b/g,
    /\bfor\s+/g,
    /\bwhile\s+/g,
    /\bloop\s*\{/g,
    /\bmatch\s+/g,
    /\bcase\s+/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
  ],
  cs: [
    /\bif\s*\(/g,
    /\belse\s+if\b/g,
    /\bfor\s*\(/g,
    /\bforeach\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcase\s+[^:]+:/g,
    /\bcatch\s*[({]/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
    /\?\s*[^:]+:/g,
  ],
};

// Jump-statement patterns that make a following else unnecessary.
const JUMP_PATTERNS: Record<string, RegExp> = {
  js: /\b(return|throw|break|continue)\b/,
  py: /\b(return|raise|break|continue)\b/,
  rs: /\b(return|break|continue)\b/,
  cs: /\b(return|throw|break|continue)\b/,
};

// Else-keyword patterns for detecting unnecessary else.
const ELSE_PATTERNS: Record<string, RegExp> = {
  js: /\}\s*else\b/,
  py: /^\s*else\s*:/,
  rs: /\}\s*else\b/,
  cs: /\}\s*else\b/,
};

// elif for Python
const ELIF_PATTERN = /^\s*elif\s+/;

function stripStringsAndComments(line: string): string {
  // Remove single-line comments
  let s = line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
  // Remove string literals (crude but effective for counting)
  s = s
    .replace(/`[^`]*`/g, "")
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
  return s;
}

/**
 * Count cyclomatic complexity for a function body.
 * CC = 1 (base) + sum of decision points.
 * Returns the raw count — caller applies threshold.
 */
export function checkCyclomaticComplexity(bodyLines: string[], lang: Language): { complexity: number } {
  if (!lang) return { complexity: 0 };
  const patterns = CC_PATTERNS[lang];
  if (!patterns) return { complexity: 0 };

  let complexity = 1; // base
  for (const line of bodyLines) {
    const stripped = stripStringsAndComments(line);
    for (const re of patterns) {
      // Reset lastIndex for global regexes
      re.lastIndex = 0;
      const matches = stripped.match(re);
      if (matches) complexity += matches.length;
    }
  }
  return { complexity };
}

/**
 * Count unnecessary else clauses in a function body.
 * An else is unnecessary when the preceding if/elif block exits
 * via return/throw/break/continue — a guard clause pattern.
 */
export function checkUnnecessaryElse(bodyLines: string[], lang: Language): { count: number } {
  if (!lang) return { count: 0 };
  const elseRe = ELSE_PATTERNS[lang];
  const jumpRe = JUMP_PATTERNS[lang];
  if (!(elseRe && jumpRe)) return { count: 0 };

  let count = 0;

  for (let i = 0; i < bodyLines.length; i++) {
    const raw = bodyLines[i];
    const trimmed = raw.trim();

    // Check for else patterns
    if (lang !== "py" && elseRe.test(trimmed)) {
      // The } right before/on the else line closes the if-body.
      // Scan backward from this line to find the last substantive statement
      // inside the if-body (skip closing braces of nested blocks and the
      // nested blocks' own content).
      let j = i - 1;
      let skipToDepth: number | null = null;
      while (j >= 0) {
        const t = bodyLines[j].trim();
        if (t === "" || t.startsWith("//") || t.startsWith("/*")) {
          j--;
          continue;
        }
        // If we hit a closing brace, skip until we find its opener's level
        if (t.endsWith("}") || t === "}") {
          if (skipToDepth === null) skipToDepth = getIndent(bodyLines[j]);
          j--;
          continue;
        }
        // If we're skipping a nested block, skip lines at same or deeper indent
        if (skipToDepth !== null) {
          if (getIndent(bodyLines[j]) >= skipToDepth) {
            j--;
            continue;
          }
          skipToDepth = null;
        }
        break;
      }
      if (j >= 0) {
        const candidate = stripStringsAndComments(bodyLines[j].trim());
        if (jumpRe.test(candidate)) {
          count++;
        }
      }
    } else if (lang === "py" && (ELSE_PATTERNS.py.test(trimmed) || ELIF_PATTERN.test(trimmed))) {
      // Python: else:/elif — check the previous indented block's last line
      const currentIndent = getIndent(raw);
      let j = i - 1;
      // Skip blank lines and comments
      while (j >= 0 && (bodyLines[j].trim() === "" || bodyLines[j].trim().startsWith("#"))) j--;
      if (j >= 0) {
        const prevIndent = getIndent(bodyLines[j]);
        // The if-body is indented more than the else/elif
        if (prevIndent > currentIndent && jumpRe.test(stripStringsAndComments(bodyLines[j].trim()))) {
          count++;
        }
      }
    }
  }

  return { count };
}

/**
 * Detect if/else pairs where the if-branch does NOT exit, but the function
 * has zero guard clauses — suggesting the whole function could adopt the
 * guard-clause style. Only fires when the function uses NO guard clauses
 * at all (no if-block anywhere in the function exits early).
 *
 * Returns count of avoidable else clauses.
 */
export function checkAvoidableElse(bodyLines: string[], lang: Language): { count: number } {
  if (!lang) return { count: 0 };
  const elseRe = ELSE_PATTERNS[lang];
  const jumpRe = JUMP_PATTERNS[lang];
  if (!(elseRe && jumpRe)) return { count: 0 };

  // Phase 1: scan for ANY existing guard clause (if + exit, no else needed)
  let hasGuardClause = false;
  for (let i = 0; i < bodyLines.length; i++) {
    const _stripped = stripStringsAndComments(bodyLines[i]);
    const trimmed = bodyLines[i].trim();

    // Check for if/elif that ends with a jump (but is NOT followed by else)
    if (lang !== "py") {
      // Brace languages: look for if-bodies ending with jump followed by } without else
      if (/\bif\s*\(/.test(trimmed) || /\belse\s+if\b/.test(trimmed)) {
        // Find the matching closing brace
        let depth = 0;
        let started = false;
        let blockEnd = -1;
        for (let j = i; j < bodyLines.length; j++) {
          const s = stripStringsAndComments(bodyLines[j]);
          for (const ch of s) {
            if (ch === "{") {
              depth++;
              started = true;
            } else if (ch === "}") {
              depth--;
              if (started && depth === 0) {
                blockEnd = j;
                break;
              }
            }
          }
          if (blockEnd >= 0) break;
        }
        if (blockEnd > i) {
          // Check if the line before blockEnd has a jump
          let prevLine = bodyLines[blockEnd - 1].trim();
          let j2 = blockEnd - 1;
          while (j2 > i && (prevLine === "" || prevLine.startsWith("//") || prevLine === "}")) {
            j2--;
            prevLine = bodyLines[j2].trim();
          }
          if (jumpRe.test(stripStringsAndComments(prevLine))) {
            // Check this if is NOT followed by else — that's a guard clause
            const nextLine = blockEnd + 1 < bodyLines.length ? bodyLines[blockEnd + 1].trim() : "";
            if (!elseRe.test(nextLine)) {
              hasGuardClause = true;
              break;
            }
          }
        }
      }
    } else {
      // Python: look for if/elif with jump at end of indented block, no else following
      if (/\bif\s+/.test(trimmed) || /\belif\s+/.test(trimmed)) {
        const blockIndent = getIndent(bodyLines[i]);
        let blockEnd = i;
        for (let j = i + 1; j < bodyLines.length; j++) {
          if (bodyLines[j].trim() === "") continue;
          if (getIndent(bodyLines[j]) <= blockIndent) {
            blockEnd = j - 1;
            break;
          }
          blockEnd = j;
        }
        if (blockEnd > i && jumpRe.test(stripStringsAndComments(bodyLines[blockEnd].trim()))) {
          // Check no else/elif follows at same indent
          const nextLine = blockEnd + 1 < bodyLines.length ? bodyLines[blockEnd + 1].trim() : "";
          if (!(ELSE_PATTERNS.py.test(nextLine) || ELIF_PATTERN.test(nextLine))) {
            hasGuardClause = true;
            break;
          }
        }
      }
    }
  }

  // Phase 2: if NO guard clauses exist, count if/else pairs as avoidable
  if (hasGuardClause) return { count: 0 };

  let count = 0;
  for (const raw of bodyLines) {
    const trimmed = raw.trim();
    if (elseRe.test(trimmed) || (lang === "py" && ELIF_PATTERN.test(trimmed))) {
      count++;
    }
  }

  return { count };
}

/** Inputs a language adapter needs to construct a command from the consumer's workspace. */
export interface WholeFileCommandContext {
  workspaceRoot: string;
  testFile: string;
  projectConfig: Readonly<Record<string, unknown>>;
}

/** The command an adapter can construct, or why its registered language has no runnable command. */
export type WholeFileCommandResolution =
  | { command: string }
  | { unresolvedReason: string };

/** One language family's test declarations and whole-file command construction. */
export interface LanguageAdapter {
  language: string;
  markerRe: RegExp;
  findTestName: (lines: string[], fromLine: number) => string | null;
  findTestBody?: (lines: string[], fromLine: number) => string | null;
  resolveWholeFileCommand: (context: WholeFileCommandContext) => WholeFileCommandResolution;
}

function unresolvedCommand(language: string): LanguageAdapter["resolveWholeFileCommand"] {
  return () => ({ unresolvedReason: `no runner command is configured for ${language} test files` });
}

const SEP = String.raw`\s*(?:::|\|\|)\s*`;
const GC = String.raw`([^:\s|]+\/[^:\s|]+)`;
const SLASH_MARKER = new RegExp(String.raw`^\s*\/\/\s*covers:\s*${GC}${SEP}(.+?)${SEP}(.+?)\s*$`);
const HASH_MARKER = new RegExp(String.raw`^\s*#\s*covers:\s*${GC}${SEP}(.+?)${SEP}(.+?)\s*$`);

function skipBlanks(lines: string[], from: number): number {
  let i = from;
  while (i < lines.length && lines[i].trim().length === 0) i++;
  return i;
}

function simpleFinder(re: RegExp, group: number): LanguageAdapter["findTestName"] {
  return (lines, from) => {
    const next = skipBlanks(lines, from);
    if (next >= lines.length) return null;
    const m = lines[next].match(re);
    return m ? m[group] : null;
  };
}

// Resolves the declaration line for a single-line marker like findTestName's simpleFinder,
// but returns the line index (for body extraction) instead of a captured name.
function findDeclLineSimple(lines: string[], from: number, re: RegExp): number | null {
  const next = skipBlanks(lines, from);
  if (next >= lines.length) return null;
  return re.test(lines[next]) ? next : null;
}

/** Net change in brace nesting a single line contributes. */
function braceDelta(line: string): number {
  const opens = line.match(/\{/g)?.length ?? 0;
  const closes = line.match(/\}/g)?.length ?? 0;
  return opens - closes;
}

// Extracts a body by counting open/close braces from the declaration line until nesting returns to zero.
function extractBraceBody(lines: string[], startLine: number | null): string | null {
  if (startLine === null || startLine >= lines.length) return null;
  const bodyLines = [lines[startLine]];
  let depth = braceDelta(lines[startLine]);
  let i = startLine;
  while (depth > 0) {
    i++;
    if (i >= lines.length) return null;
    bodyLines.push(lines[i]);
    depth += braceDelta(lines[i]);
  }
  return bodyLines.join("\n");
}

/** Leading whitespace width of a line, tabs counted as one column. */
function lineIndent(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

/** Whether a line ends an indentation-delimited body: non-blank at or above declIndent. */
function endsBodyAt(line: string, declIndent: number): boolean {
  return line.trim().length !== 0 && lineIndent(line) <= declIndent;
}

// Extracts a body from the declaration line forward until a non-blank line at
// equal or lesser indentation appears.
function extractIndentBody(lines: string[], startLine: number | null): string | null {
  if (startLine === null || startLine >= lines.length) return null;
  const declIndent = lineIndent(lines[startLine]);
  let end = startLine + 1;
  while (end < lines.length && !endsBodyAt(lines[end], declIndent)) end++;
  return lines.slice(startLine, end).join("\n");
}

const JS_SPEC: LanguageAdapter = {
  language: "javascript",
  markerRe: SLASH_MARKER,
  findTestName: simpleFinder(/^\s*(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/, 2),
  findTestBody: (lines, from) => extractBraceBody(lines, findDeclLineSimple(lines, from, /^\s*(?:test|it)\(/)),
  resolveWholeFileCommand: unresolvedCommand("javascript"),
};

const PY_SPEC: LanguageAdapter = {
  language: "python",
  markerRe: HASH_MARKER,
  findTestName: simpleFinder(/^\s*(?:async\s+)?def\s+(test_\w+)\s*\(/, 1),
  findTestBody: (lines, from) =>
    extractIndentBody(lines, findDeclLineSimple(lines, from, /^\s*(?:async\s+)?def\s+test_\w+\s*\(/)),
  resolveWholeFileCommand: unresolvedCommand("python"),
};

const GO_SPEC: LanguageAdapter = {
  language: "go",
  markerRe: SLASH_MARKER,
  findTestName: simpleFinder(/^\s*func\s+(Test\w*)\s*\(/, 1),
  findTestBody: (lines, from) => extractBraceBody(lines, findDeclLineSimple(lines, from, /^\s*func\s+Test\w*\s*\(/)),
  resolveWholeFileCommand: unresolvedCommand("go"),
};

const RS_SPEC: LanguageAdapter = {
  language: "rust",
  markerRe: SLASH_MARKER,
  findTestName: (lines, from) => {
    const attrLine = skipBlanks(lines, from);
    if (attrLine >= lines.length) return null;
    if (!/^\s*#\[test\]/.test(lines[attrLine])) return null;
    const fnLine = skipBlanks(lines, attrLine + 1);
    if (fnLine >= lines.length) return null;
    const m = lines[fnLine].match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(/);
    return m ? m[1] : null;
  },
  findTestBody: (lines, from) => {
    const attrLine = skipBlanks(lines, from);
    if (attrLine >= lines.length) return null;
    if (!/^\s*#\[test\]/.test(lines[attrLine])) return null;
    const fnLine = findDeclLineSimple(lines, attrLine + 1, /^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+\s*\(/);
    return extractBraceBody(lines, fnLine);
  },
  resolveWholeFileCommand: unresolvedCommand("rust"),
};

const RB_SPEC: LanguageAdapter = {
  language: "ruby",
  markerRe: HASH_MARKER,
  findTestName: (lines, from) => {
    const next = skipBlanks(lines, from);
    if (next >= lines.length) return null;
    const defMatch = lines[next].match(/^\s*def\s+(test_\w+)\s*[(\n]/);
    if (defMatch) return defMatch[1];
    const itMatch = lines[next].match(/^\s*it\s*[\s(]+(['"`])((?:\\.|(?!\1).)*)\1/);
    return itMatch ? itMatch[2] : null;
  },
  findTestBody: (lines, from) =>
    extractIndentBody(lines, findDeclLineSimple(lines, from, /^\s*(?:def\s+test_\w+\s*\(|it\s*[\s(]+)/)),
  resolveWholeFileCommand: unresolvedCommand("ruby"),
};

const JAVA_KT_SPEC: LanguageAdapter = {
  language: "java",
  markerRe: SLASH_MARKER,
  findTestName: (lines, from) => {
    const next = skipBlanks(lines, from);
    if (next >= lines.length) return null;
    const direct = lines[next].match(
      /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:suspend\s+)?(?:void|fun)\s+(test\w*)\s*\(/i,
    );
    if (direct) return direct[1];
    if (/^\s*@Test/.test(lines[next])) {
      const fnLine = skipBlanks(lines, next + 1);
      if (fnLine >= lines.length) return null;
      const m = lines[fnLine].match(
        /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:suspend\s+)?(?:void|fun)\s+(\w+)\s*\(/,
      );
      return m ? m[1] : null;
    }
    return null;
  },
  findTestBody: (lines, from) => {
    const next = skipBlanks(lines, from);
    if (next >= lines.length) return null;
    const directRe =
      /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:suspend\s+)?(?:void|fun)\s+test\w*\s*\(/i;
    if (directRe.test(lines[next])) return extractBraceBody(lines, next);
    if (/^\s*@Test/.test(lines[next])) {
      const fnRe = /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:suspend\s+)?(?:void|fun)\s+\w+\s*\(/;
      const fnLine = findDeclLineSimple(lines, next + 1, fnRe);
      return extractBraceBody(lines, fnLine);
    }
    return null;
  },
  resolveWholeFileCommand: unresolvedCommand("java"),
};

const SH_SPEC: LanguageAdapter = {
  language: "shell",
  markerRe: HASH_MARKER,
  findTestName: simpleFinder(/^\s*(?:function\s+)?(test_\w+)\s*\(\s*\)/, 1),
  findTestBody: (lines, from) =>
    extractBraceBody(lines, findDeclLineSimple(lines, from, /^\s*(?:function\s+)?test_\w+\s*\(\s*\)/)),
  resolveWholeFileCommand: unresolvedCommand("shell"),
};

const KOTLIN_SPEC: LanguageAdapter = {
  ...JAVA_KT_SPEC,
  language: "kotlin",
  resolveWholeFileCommand: unresolvedCommand("kotlin"),
};

export const LANG_TABLE: ReadonlyMap<string, LanguageAdapter> = new Map<string, LanguageAdapter>([
  [".ts", JS_SPEC],
  [".js", JS_SPEC],
  [".mjs", JS_SPEC],
  [".cjs", JS_SPEC],
  [".py", PY_SPEC],
  [".go", GO_SPEC],
  [".rs", RS_SPEC],
  [".rb", RB_SPEC],
  [".java", JAVA_KT_SPEC],
  [".kt", KOTLIN_SPEC],
  [".sh", SH_SPEC],
  [".bash", SH_SPEC],
]);

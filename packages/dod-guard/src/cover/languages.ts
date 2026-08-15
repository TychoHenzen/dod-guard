interface LanguageSpec {
  markerRe: RegExp;
  findTestName: (lines: string[], fromLine: number) => string | null;
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

function simpleFinder(re: RegExp, group: number): (lines: string[], from: number) => string | null {
  return (lines, from) => {
    const next = skipBlanks(lines, from);
    if (next >= lines.length) return null;
    const m = lines[next].match(re);
    return m ? m[group] : null;
  };
}

const JS_SPEC: LanguageSpec = {
  markerRe: SLASH_MARKER,
  findTestName: simpleFinder(/^\s*(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/, 2),
};

const PY_SPEC: LanguageSpec = {
  markerRe: HASH_MARKER,
  findTestName: simpleFinder(/^\s*(?:async\s+)?def\s+(test_\w+)\s*\(/, 1),
};

const GO_SPEC: LanguageSpec = {
  markerRe: SLASH_MARKER,
  findTestName: simpleFinder(/^\s*func\s+(Test\w*)\s*\(/, 1),
};

const RS_SPEC: LanguageSpec = {
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
};

const RB_SPEC: LanguageSpec = {
  markerRe: HASH_MARKER,
  findTestName: (lines, from) => {
    const next = skipBlanks(lines, from);
    if (next >= lines.length) return null;
    const defMatch = lines[next].match(/^\s*def\s+(test_\w+)\s*[(\n]/);
    if (defMatch) return defMatch[1];
    const itMatch = lines[next].match(/^\s*it\s*[\s(]+(['"`])((?:\\.|(?!\1).)*)\1/);
    return itMatch ? itMatch[2] : null;
  },
};

const JAVA_KT_SPEC: LanguageSpec = {
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
};

const SH_SPEC: LanguageSpec = {
  markerRe: HASH_MARKER,
  findTestName: simpleFinder(/^\s*(?:function\s+)?(test_\w+)\s*\(\s*\)/, 1),
};

export const LANG_TABLE: ReadonlyMap<string, LanguageSpec> = new Map<string, LanguageSpec>([
  [".ts", JS_SPEC],
  [".js", JS_SPEC],
  [".mjs", JS_SPEC],
  [".cjs", JS_SPEC],
  [".py", PY_SPEC],
  [".go", GO_SPEC],
  [".rs", RS_SPEC],
  [".rb", RB_SPEC],
  [".java", JAVA_KT_SPEC],
  [".kt", JAVA_KT_SPEC],
  [".sh", SH_SPEC],
  [".bash", SH_SPEC],
]);

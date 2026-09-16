import { matchBracket } from "./offsets.mjs";
import { pythonTypes } from "./architecture-python-types.mjs";
import { strip } from "./strip.mjs";
import { csharpRecordBody } from "./architecture-csharp-records.mjs";

const TYPE_PATTERNS = {
  ts: new RegExp(
    String.raw`\b(?:export\s+)?(?:abstract\s+)?` +
      String.raw`(class|interface|enum)\s+([A-Za-z_$][\w$]*)`,
    "g",
  ),
  cs: new RegExp(
      String.raw`\b(?:public\s+|internal\s+|private\s+|protected\s+)?` +
      String.raw`(record(?:\s+struct)?|class|interface|struct|enum)\s+` +
      String.raw`([A-Za-z_]\w*)(?:\s*<[^;{}()]*>)?`,
    "g",
  ),
  java: new RegExp(
    String.raw`\b(?:public\s+|internal\s+|private\s+|protected\s+)?` +
      String.raw`(class|interface|enum|record)\s+([A-Za-z_]\w*)`,
    "g",
  ),
  rs: /\b(?:pub\s+)?(struct|enum|trait|union)\s+([A-Za-z_]\w*)/g,
  go: /\btype\s+([A-Za-z_]\w*)\s+(struct|interface)\b/g,
  cpp: /\b(class|struct|enum)\s+([A-Za-z_]\w*)/g,
};

function braceBody(source, offset) {
  const open = source.indexOf("{", offset);
  if (open === -1) return null;
  const close = matchBracket(source, open, "{}");
  if (close === -1) return null;
  return { start: open + 1, end: close, text: source.slice(open + 1, close) };
}

function typeName(match, lang) {
  return lang === "go" ? match[1] : match[2];
}

function typeKind(match, lang) {
  if (lang === "go") return match[2];
  if (lang === "cs" && /^record\s+struct$/.test(match[1])) return "struct";
  return match[1];
}

function declarationBody({ source, searchable, match, lang }) {
  const offset = match.index + match[0].length;
  const csharpBody = lang === "cs"
    ? csharpRecordBody({ source, searchable, match })
    : undefined;
  return csharpBody === undefined ? braceBody(source, offset) : csharpBody;
}

export function declaredTypes(source, lang) {
  if (lang === "py") return { types: pythonTypes(source) };
  const pattern = TYPE_PATTERNS[lang];
  pattern.lastIndex = 0;
  const searchable = strip(source, lang).code;
  const types = [];
  let match = pattern.exec(searchable);
  while (match !== null) {
    const body = declarationBody({ source, searchable, match, lang });
    if (!body)
      return {
        types: [],
        error:
          `cannot extract required architecture facts: ` +
          `${typeName(match, lang)} ` +
          "has no closed body",
      };
    types.push({
      kind: typeKind(match, lang),
      name: typeName(match, lang),
      start: match.index,
      body,
    });
    match = pattern.exec(searchable);
  }
  return { types };
}

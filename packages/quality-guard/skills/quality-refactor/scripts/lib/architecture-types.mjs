import { matchBracket } from "./offsets.mjs";
import { pythonTypes } from "./architecture-python-types.mjs";

const TYPE_PATTERNS = {
  ts: new RegExp(
    String.raw`\b(?:export\s+)?(?:abstract\s+)?` +
      String.raw`(class|interface|enum)\s+([A-Za-z_$][\w$]*)`,
    "g",
  ),
  cs: new RegExp(
    String.raw`\b(?:public\s+|internal\s+|private\s+|protected\s+)?` +
      String.raw`(class|interface|struct|enum|record)\s+([A-Za-z_]\w*)`,
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

function blankComments(source) {
  return source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
}

function typeName(match, lang) {
  return lang === "go" ? match[1] : match[2];
}

function typeKind(match, lang) {
  return lang === "go" ? match[2] : match[1];
}

export function declaredTypes(source, lang) {
  if (lang === "py") return { types: pythonTypes(source) };
  const pattern = TYPE_PATTERNS[lang];
  const searchable = blankComments(source);
  const types = [];
  let match = pattern.exec(searchable);
  while (match !== null) {
    const body = braceBody(source, match.index + match[0].length);
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

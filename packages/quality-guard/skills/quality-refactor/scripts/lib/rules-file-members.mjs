import { matchBracket } from "./offsets.mjs";

const FIELD_MODIFIER =
  "private|protected|internal|public|readonly|static|const|final";
const FIELD_DECL = new RegExp(
  `\\b(?:${FIELD_MODIFIER})\\s+[\\w<>[\\],.? ]+?\\s+(\\w+)\\s*[;=]`,
  "g",
);
const CS_PROPERTY_DECL = new RegExp(
  `\\b(?:${FIELD_MODIFIER})\\s+[\\w<>[\\],.? ]+?\\s+(\\w+)\\s*` +
    `(?:\\{\\s*(?:private\\s+|protected\\s+|internal\\s+)?` +
    `(?:get|init)\\b|=>)`,
  "g",
);
const CPP_FIELD_DECL = new RegExp(
  String.raw`^[ \t]*(?:(?:static|const|mutable|volatile)[ \t]+)*` +
    String.raw`[\w:<>[\],.&*~]+?[ \t]+[*&]?(\w+)[ \t]*[;=]`,
  "gm",
);
const RUST_FIELD_DECL =
  /^[ \t]*(?:pub(?:\([\w:, ]*\))?\s+)?([A-Za-z_]\w*)\s*:/gm;

function namesFrom(pattern, body) {
  const names = new Set();
  pattern.lastIndex = 0;
  let match = pattern.exec(body);
  while (match !== null) {
    names.add(match[1]);
    match = pattern.exec(body);
  }
  return names;
}

function blankNested(body) {
  const parts = [body.slice(0, 1)];
  let i = 1;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "{") {
      const close = matchBracket(body, i, "{}");
      const end = close === -1 ? body.length : close + 1;
      parts.push(body.slice(i, end).replace(/[^\n]/g, " "));
      i = end;
      continue;
    }
    parts.push(ch);
    i += 1;
  }
  return parts.join("");
}

function cppFieldNames(body) {
  return namesFrom(CPP_FIELD_DECL, blankNested(body));
}

function rustFieldNames(body) {
  return namesFrom(RUST_FIELD_DECL, body);
}

function fieldNames(body) {
  return namesFrom(FIELD_DECL, body);
}

function csPropertyNames(body) {
  return namesFrom(CS_PROPERTY_DECL, body);
}

export function fieldsFor(body, lang) {
  if (lang === "rs") return rustFieldNames(body);
  const names = fieldNames(body);
  const extra = { cs: csPropertyNames, cpp: cppFieldNames }[lang];
  if (extra) for (const name of extra(body)) names.add(name);
  return names;
}

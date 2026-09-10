import { visibility } from "./architecture-language.mjs";
import {
  fieldDependencies,
  fieldMembers,
  forwardingPaths,
} from "./architecture-fields.mjs";

const METHOD_PATTERNS = {
  ts: new RegExp(
    String.raw`(^|[;{}\n])\s*((?:(?:public|private|` +
      String.raw`protected|static|async|readonly)\s+)*)?` +
      String.raw`([#A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*[{=>]`,
    "g",
  ),
  cs: new RegExp(
    String.raw`(^|[;{}\n])\s*((?:(?:public|private|protected|` +
      String.raw`internal|static|async|virtual|override)\s+)*)?` +
      String.raw`\w[\w<>?,.\[\]]*\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{`,
    "g",
  ),
  java: new RegExp(
    String.raw`(^|[;{}\n])\s*((?:(?:public|private|protected|` +
      String.raw`internal|static|suspend|open|override)\s+)*)?` +
      String.raw`[\w<>?,.\[\]]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{`,
    "g",
  ),
  rs: new RegExp(
    String.raw`\b((?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?)fn\s+` +
      String.raw`([A-Za-z_]\w*)\s*\([^)]*\)`,
    "g",
  ),
  go: /\bfunc\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)\s*\([^)]*\)/g,
  cpp: new RegExp(
    String.raw`(^|[;{}\n])\s*((?:(?:public|private|protected|` +
      String.raw`static|virtual|explicit)\s+)*)?` +
      String.raw`[\w:<>*&]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{`,
    "g",
  ),
  py: /^\s*def\s+([A-Za-z_]\w*)\s*\(/gm,
};

function methodName(match, lang) {
  return lang === "go" || lang === "py" ? match[1] : (match[3] ?? match[2]);
}

function methodPrefix(match, lang) {
  if (lang === "go" || lang === "py") return "";
  return [match[2], match[1], ""].find((value) => value !== undefined);
}

function isControl(name) {
  return ["if", "for", "while", "switch", "catch"].includes(name);
}

function methodMembers(body, lang) {
  const pattern = METHOD_PATTERNS[lang];
  const members = [];
  let match = pattern.exec(body);
  while (match !== null) {
    const name = methodName(match, lang);
    if (!isControl(name)) {
      members.push({
        name,
        kind: "method",
        visibility: visibility(methodPrefix(match, lang), lang, name),
      });
    }
    match = pattern.exec(body);
  }
  return members;
}

export function typeFacts(type, lang) {
  const methods = methodMembers(type.body.text, lang);
  const fields = fieldMembers(type.body.text, lang);
  const members = [...methods, ...fields].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.name.localeCompare(right.name),
  );
  return {
    name: type.name,
    kind: type.kind,
    members,
    dependencies: fieldDependencies(type.body.text),
    forwardingPaths: forwardingPaths(type.body.text, methods),
  };
}

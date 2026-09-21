import { fieldsFor } from "./rules-file-members.mjs";
import { NAMING_PATTERNS, PYTHON_MEMBER } from "./rules-file-naming-patterns.mjs";
import { matchBracket } from "./offsets.mjs";

function scopeEnd(body, cursor) {
  const opener = body[cursor];
  const close = matchBracket(body, cursor, opener === "{" ? "{}" : "()");
  return close < 0 ? body.length : close + 1;
}

function blankNestedScopes(body) {
  const parts = [body[0] === "{" ? " " : body.slice(0, 1)];
  let cursor = 1;
  while (cursor < body.length) {
    const opener = body[cursor];
    if (opener !== "{" && opener !== "(") {
      parts.push(opener);
      cursor += 1;
      continue;
    }
    const end = scopeEnd(body, cursor);
    parts.push(body.slice(cursor, end).replace(/[^\n]/g, " "));
    cursor = end;
  }
  return parts.join("");
}

function namingMatches({ pattern, source, baseOffset, accept }) {
  const result = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    if (accept(match[1]))
      result.push({
        name: match[1],
        offset: baseOffset + match.index + match[0].lastIndexOf(match[1]),
      });
    match = pattern.exec(source);
  }
  return result;
}

function namingAcceptance(file, fields) {
  return (name) => fields.has(name) || file.lang === "cs" || file.lang === "ts";
}

function namingPatternMatches({ patterns, source, baseOffset, accept }) {
  return patterns.flatMap((pattern) =>
    namingMatches({ pattern, source, baseOffset, accept }),
  );
}

function namingSpanMatches(file, span) {
  if (file.lang === "rs" && span.kind === "impl") return [];
  const patterns = NAMING_PATTERNS[file.lang];
  if (!patterns) return [];
  const accept = namingAcceptance(file, fieldsForSpan(file, span));
  return [
    ...namingPatternMatches({
      patterns,
      source: blankNestedScopes(span.body),
      baseOffset: span.open,
      accept,
    }),
    ...propertyMatches({ file, span, patterns, accept }),
  ];
}

function fieldsForSpan(file, span) {
  return span.fields ?? fieldsFor(span.body, file.lang);
}

function propertyMatches({ file, span, patterns, accept }) {
  if (file.lang !== "cs") return [];
  return namingMatches({
    pattern: patterns[2],
    source: span.body,
    baseOffset: span.open,
    accept,
  });
}

export function encodedMemberMatches(file, code, spans) {
  if (/(^|[\\/])(?:generated|interop)(?:[\\/]|$)|\.generated\./i.test(file.rel))
    return [];
  if (file.lang === "py")
    return namingMatches({
      pattern: PYTHON_MEMBER,
      source: code,
      baseOffset: 0,
      accept: () => true,
    });
  const unique = new Map();
  for (const match of spans.flatMap((span) => namingSpanMatches(file, span)))
    unique.set(`${match.name}:${match.offset}`, match);
  return [...unique.values()];
}

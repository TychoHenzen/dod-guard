import {
  readBlockComment,
  readLineComment,
  readQuoted,
} from "./strip-readers.mjs";
import { EXOTIC_STRINGS } from "./strip-exotic.mjs";
import { readRegex } from "./strip-regex.mjs";

const LINE_COMMENT = {
  ts: "//",
  cs: "//",
  rs: "//",
  go: "//",
  java: "//",
  cpp: "//",
  py: "#",
};
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^\n");
const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "yield",
  "await",
]);

function blockComment(src, i, lang) {
  if (lang === "py" || !src.startsWith("/*", i)) return null;
  return { end: readBlockComment(src, i), isComment: true };
}

function lineComment(src, i, lang) {
  const marker = LINE_COMMENT[lang] ?? "//";
  return src.startsWith(marker, i)
    ? { end: readLineComment(src, i), isComment: true }
    : null;
}

function tryComment(src, i, lang) {
  return blockComment(src, i, lang) ?? lineComment(src, i, lang);
}

function isRustLifetimeQuote(lang, ch) {
  return lang === "rs" && ch === "'";
}

function rustStringCaptures(lang, ch) {
  return lang === "rs" && ch === '"' ? { braceCount: 1, escaped: true } : null;
}

function tryString(src, i, lang) {
  const exotic = EXOTIC_STRINGS[lang]?.(src, i);
  if (exotic) return exotic;
  const ch = src[i];
  if (isRustLifetimeQuote(lang, ch)) return null;
  if (ch !== '"' && ch !== "'") return null;
  return {
    end: readQuoted(src, i, ch),
    isComment: false,
    captures: rustStringCaptures(lang, ch),
  };
}

function canOpenRegex({ src, i, lang, previous }) {
  if (lang !== "ts" || src[i] !== "/") return false;
  const opensRegex =
    REGEX_AFTER.has(previous.char) || REGEX_AFTER_WORD.has(previous.word);
  return opensRegex;
}

function tryRegex({ src, i, lang, previous }) {
  if (!canOpenRegex({ src, i, lang, previous })) return null;
  const end = readRegex(src, i);
  return end === null ? null : { end, isComment: false };
}

export function matchSpan(state) {
  const { source, cursor, lang, previous } = state;
  const i = cursor.index;
  return (
    tryComment(source, i, lang) ??
    tryRegex({ src: source, i, lang, previous }) ??
    tryString(source, i, lang)
  );
}

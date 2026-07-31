// Tokenizing and line helpers shared by the blind-rewrite overlap gate.

const COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|^\s*#[^\n]*/gm;
const TOKEN_PATTERN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s\w]/g;
const DECLARATION_PATTERN =
  /(?:function|class|const|let|var|def|fn|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const TRIVIAL_LINE = /^[\s{}()[\];,]*$/;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const MIN_LINE_LENGTH = 8;
const GRAM_SEPARATOR = " ";

function stripComments(text) {
  return text.replace(COMMENT_PATTERN, " ");
}

export function tokenize(text, whitelist = []) {
  const banned = new Set(whitelist);
  const tokens = stripComments(text).match(TOKEN_PATTERN) ?? [];
  return tokens.filter((token) => !banned.has(token));
}

export function ngrams(tokens, size) {
  const out = [];
  for (let i = 0; i + size <= tokens.length; i += 1) {
    out.push(tokens.slice(i, i + size).join(GRAM_SEPARATOR));
  }
  return out;
}

// A whitelisted token names part of the contract boundary. Identical text around
// it is required rather than suspicious, so every metric exempts it.
function mentionsWhitelist(text, whitelist) {
  return whitelist.some((token) => {
    const escaped = token.replace(REGEXP_SPECIALS, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(text);
  });
}

function isSignificant(line) {
  return line.length >= MIN_LINE_LENGTH && !TRIVIAL_LINE.test(line);
}

export function significantLines(text, whitelist = []) {
  return stripComments(text)
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => isSignificant(line))
    .filter((line) => !mentionsWhitelist(line, whitelist));
}

export function declarations(text, whitelist = []) {
  const banned = new Set(whitelist);
  const names = [];
  for (const match of stripComments(text).matchAll(DECLARATION_PATTERN)) {
    if (!banned.has(match[1])) {
      names.push(match[1]);
    }
  }
  return names;
}

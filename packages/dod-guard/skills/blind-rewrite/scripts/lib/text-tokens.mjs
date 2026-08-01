// Tokenizing and line helpers shared by the blind-rewrite overlap gate.

const COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|^\s*#[^\n]*/gm;
const TOKEN_PATTERN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s\w]/g;
const DECLARATION_KEYWORDS = "function|class|const|let|var|def|fn|type|interface|enum";
const DECLARATION_PATTERN = new RegExp(
  `(?:${DECLARATION_KEYWORDS})\\s+([A-Za-z_$][\\w$]*)`,
  "g",
);
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

// Index of the first place `needle` occurs as a contiguous run inside
// `haystack`, or -1. Both are token arrays, so this matches regardless of the
// whitespace, line breaks or comments the tokens came from.
function findRun(haystack, needle) {
  if (needle.length === 0 || needle.length > haystack.length) {
    return -1;
  }
  const last = haystack.length - needle.length;
  for (let i = 0; i <= last; i += 1) {
    if (needle.every((token, j) => haystack[i + j] === token)) {
      return i;
    }
  }
  return -1;
}

// Removes every occurrence of every run from the token stream, longest run
// first so a shorter contract string cannot fragment a longer one it sits
// inside of. A run that appears more than once is removed each time.
export function removeTokenRuns(tokens, runs) {
  let result = tokens;
  for (const run of runs) {
    let index = findRun(result, run);
    while (index !== -1) {
      result = [...result.slice(0, index), ...result.slice(index + run.length)];
      index = findRun(result, run);
    }
  }
  return result;
}

// True when a line's own tokens are entirely a contiguous slice of some
// contract run: the line is contract text, not evidence of copying.
function isContractLine(lineTokens, contractRuns) {
  return contractRuns.some((run) => findRun(run, lineTokens) !== -1);
}

// A whitelisted token names part of the contract boundary. Identical text
// around it is required rather than suspicious, so every metric exempts it.
function mentionsWhitelist(text, whitelist) {
  return whitelist.some((token) => {
    const escaped = token.replace(REGEXP_SPECIALS, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(text);
  });
}

function isSignificant(line) {
  return line.length >= MIN_LINE_LENGTH && !TRIVIAL_LINE.test(line);
}

export function significantLines(text, whitelist = [], contractRuns = []) {
  return stripComments(text)
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => isSignificant(line))
    .filter((line) => !mentionsWhitelist(line, whitelist))
    .filter((line) => !isContractLine(tokenize(line, whitelist), contractRuns));
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

// Normalizes a documentation claim's text into a comparable form. A reformat
// commit should not look like a content change. That covers rewraps, heading
// bumps, list-marker swaps, and case changes. claimTokens() builds a content
// token bag for pair scoring. contentDigest() is the piece a later step uses
// to tell a reformat commit from a real content edit.

import { createHash } from "node:crypto";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "is", "are", "was", "were", "be", "been", "being", "with", "as", "by",
  "that", "this", "these", "those", "it", "its", "from", "into", "than",
  "then", "so", "if", "not", "no", "do", "does", "did", "has", "have", "had",
  "will", "would", "can", "could", "should", "may", "might", "must", "shall",
  "which", "who", "whom", "whose", "what", "when", "where", "why", "how",
  "there", "here", "also", "such", "very", "just", "only", "own", "same",
  "too", "most", "more", "some", "any", "each", "other", "because", "while",
  "during", "before", "after", "above", "below", "up", "down", "out", "off",
  "again", "further", "once",
]);

const HEADING_PREFIX = /^#{1,6}\s+/;
const LIST_PREFIX = /^(?:[-*+]|\d+\.)\s+/;
const QUOTE_PREFIX = /^>\s*/;
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
const BOLD_RE = /(\*\*|__)(.+?)\1/g;
const ITALIC_RE = /(\*|_)(.+?)\1/g;
const STRIKE_RE = /~~(.+?)~~/g;

// Order matters here. Each alternative is tried in this order at every
// start position. The specific shapes (code span, flag, decimal number)
// must come before the loose ones (file path, dotted identifier).
// Otherwise the loose shape wins the match first.
const PROTECT_RE =
  /`[^`\n]+`|(?:^|(?<=[\s(]))--?[A-Za-z][\w-]*(?:=\S+)?|\d+\.\d+|[A-Za-z0-9_.-]*\/[A-Za-z0-9_./-]+|[A-Za-z_][\w]*(?:[._][\w]+)+/g;

const DROP_PUNCTUATION = /[,.:;"'()!?]/g;
const PLACEHOLDER_RE = /(\d+)/g;

// A protected match can pick up a sentence's closing punctuation: the path
// in "/ratchet." grabs the period. Strip it once it sits at the very end.
// Punctuation followed by more characters, like the ".js" in "bundle.js" or
// the "." in "1.5", never sits at the end. This never touches it.
const TRAILING_SENTENCE_PUNCTUATION = /[.,;:!?]+$/;

// A CLI flag's value can end in a real ".". "--root=." means "here". That
// trailing character is data, not sentence punctuation. Flag matches start
// with "-" and skip the trailing strip.
function isFlagMatch(match) {
  return match[0] === "-";
}

function wrapPlaceholder(index) {
  return `${index}`;
}

function stripLinePrefix(line) {
  return line.replace(HEADING_PREFIX, "").replace(LIST_PREFIX, "").replace(QUOTE_PREFIX, "");
}

// Markdown structure that is purely positional: heading hashes, list
// markers, blockquote markers, table pipes. None of it carries content.
function stripStructure(text) {
  return text
    .split(/\r?\n/)
    .map(stripLinePrefix)
    .join("\n")
    .replace(/\|/g, " ");
}

// Markdown emphasis that wraps content: links keep their visible text and
// drop the URL, bold/italic/strikethrough keep the wrapped text.
function stripEmphasis(text) {
  return text.replace(LINK_RE, "$1").replace(BOLD_RE, "$2").replace(ITALIC_RE, "$2").replace(STRIKE_RE, "$1");
}

// Pulls code spans, file paths, CLI flags and dotted identifiers out of the
// text before punctuation gets dropped. Their internal punctuation must
// survive. Returns the text with placeholders in place of each match, plus
// the matches themselves (backticks stripped, lowercased) to restore later.
function protectTokens(text) {
  const saved = [];
  const withPlaceholders = text.replace(PROTECT_RE, (match) => {
    let cleaned = match.replace(/`/g, "").toLowerCase();
    if (!isFlagMatch(match)) {
      cleaned = cleaned.replace(TRAILING_SENTENCE_PUNCTUATION, "");
    }
    saved.push(cleaned);
    return wrapPlaceholder(saved.length - 1);
  });
  return { withPlaceholders, saved };
}

function restoreTokens(text, saved) {
  return text.replace(PLACEHOLDER_RE, (_, index) => saved[Number(index)]);
}

// Returns the comparable form of a claim's text. It lowercases, strips
// markdown syntax, collapses whitespace to single spaces, and drops
// meaningless punctuation. Code spans, file paths, CLI flags and dotted
// identifiers skip the punctuation strip. They survive as recognizable
// strings: `--root=.`, `packages/dod-guard/dist/bundle.js`, `dod_check`.
export function normalizeClaim(text) {
  const structured = stripStructure(String(text ?? ""));
  const deEmphasized = stripEmphasis(structured);
  const { withPlaceholders, saved } = protectTokens(deEmphasized);
  const stripped = withPlaceholders.toLowerCase().replace(DROP_PUNCTUATION, "");
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  return restoreTokens(collapsed, saved);
}

// Returns the content tokens of a claim: the normalized form split on
// whitespace with stopwords removed. Order and duplicates are preserved so
// the caller can decide whether to set-ify.
export function claimTokens(text) {
  const normalized = normalizeClaim(text);
  if (normalized === "") {
    return [];
  }
  return normalized.split(" ").filter((token) => !STOPWORDS.has(token));
}

// Returns a stable 16-hex-char sha1 digest of the normalized form. Two texts
// that differ only in whitespace, wrapping, case, punctuation, heading level
// or list marker hash the same. Any word difference changes the digest.
export function contentDigest(text) {
  const normalized = normalizeClaim(text);
  return createHash("sha1").update(normalized).digest("hex").slice(0, 16);
}

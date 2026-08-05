// Sentence-splitting internals for prose-tokens.mjs, kept in their own file so
// the abbreviation/decimal protection logic does not push the caller over the
// file-length bound.

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;
// A control character that cannot appear in real prose, used to hide a
// period from the sentence splitter while an abbreviation or decimal is
// resolved, then restored once splitting is done.
const PLACEHOLDER = "\u0001";
const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "mr.", "mrs.", "ms.", "dr.", "vs."];

function escapeRegex(value) {
  return value.replace(REGEXP_SPECIALS, "\\$&");
}

// Hides the periods inside known abbreviations so the sentence splitter does
// not treat "e.g." or "Mr." as a sentence boundary.
function protectAbbreviations(text) {
  let out = text;
  for (const abbreviation of ABBREVIATIONS) {
    const pattern = new RegExp(`\\b${escapeRegex(abbreviation)}`, "gi");
    out = out.replace(pattern, (match) => match.replace(/\./g, PLACEHOLDER));
  }
  return out;
}

// Hides the period inside a decimal number like "3.5" for the same reason.
function protectDecimals(text) {
  return text.replace(/(\d)\.(\d)/g, `$1${PLACEHOLDER}$2`);
}

export function splitSentences(block) {
  const protectedBlock = protectDecimals(protectAbbreviations(block));
  return protectedBlock
    .split(SENTENCE_SPLIT)
    .map((part) => part.replace(new RegExp(PLACEHOLDER, "g"), ".").trim())
    .filter(Boolean);
}

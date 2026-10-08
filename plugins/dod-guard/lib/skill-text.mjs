// Skill-contract tests pin wording in Markdown that wraps at any column, so a
// space in a phrase matches any whitespace run, line breaks included. Several
// phrases must appear in the given order, with any text between them.
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function phrasePattern(phrase) {
  return phrase.replace(REGEX_SPECIAL, "\\$&").replace(/\s+/g, "\\s+");
}

export function prose(...phrases) {
  return new RegExp(phrases.map(phrasePattern).join("[\\s\\S]*"));
}

const STOPWORDS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
  "into",
  "which",
  "when",
  "then",
]);

function stem(word) {
  for (const suffix of ["ies", "ing", "ed", "es", "s"]) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix))
      return word.slice(0, -suffix.length);
  }
  return word;
}

export function contentWords(text) {
  const tokens = text.match(/[A-Z]+(?![a-z])|[A-Za-z][a-z]+/g) ?? [];
  return tokens
    .map((token) => stem(token.toLowerCase()))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

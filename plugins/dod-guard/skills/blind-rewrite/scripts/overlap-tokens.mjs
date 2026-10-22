// Token views of a text for the overlap gate: plain tokens, n-grams, and a
// code-shape view that masks numbers and identifiers.
export function tokens(text) {
  return text.toLowerCase().match(/[a-z0-9_$#@.-]+/g) ?? [];
}

export function ngrams(values, size) {
  const result = new Set();
  for (let index = 0; index <= values.length - size; index += 1) {
    result.add(values.slice(index, index + size).join(" "));
  }
  return result;
}

const CODE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "switch",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export function codeShapeTokens(text) {
  return tokens(text).map((token) => {
    if (/^\d+(?:\.\d+)?$/.test(token)) return "$number";
    if (/^[a-z_$][a-z0-9_$.-]*$/i.test(token) && !CODE_KEYWORDS.has(token)) return "$identifier";
    return token;
  });
}

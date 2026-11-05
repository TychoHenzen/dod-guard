const INLINE_MIN_WORDS = 2;
const FENCE = /^\s*```/;

// Trim every line and drop blank ones so indentation and CRLF never decide a match.
export function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function withoutFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

// Separates fenced code blocks from the prose around them; an unclosed fence is dropped.
function toggleFence(state) {
  if (state.block !== null) state.fenced.push(state.block.join("\n"));
  state.block = state.block === null ? [] : null;
}

function splitFences(text) {
  const state = { fenced: [], prose: [], block: null };
  for (const line of text.split("\n")) {
    if (!FENCE.test(line)) {
      (state.block ?? state.prose).push(line);
      continue;
    }
    toggleFence(state);
  }
  return { fenced: state.fenced, prose: state.prose.join("\n") };
}

function inlineSpans(prose) {
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
  return spans.filter((span) => span.split(/\s+/).length >= INLINE_MIN_WORDS);
}

// Returns { fenced: string[], inline: string[] } from the original, frontmatter excluded.
export function extractExactText(text) {
  const { fenced, prose } = splitFences(withoutFrontmatter(text).replace(/\r\n/g, "\n"));
  return {
    fenced: [...new Set(fenced.filter((block) => normalize(block)))],
    inline: [...new Set(inlineSpans(prose))],
  };
}

function isFilled(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isRecord(value) {
  return value !== null && typeof value === "object";
}

function cutFieldProblems(cut, label) {
  const problems = [];
  if (!isFilled(cut.reason)) problems.push(`${label} needs a non-empty reason`);
  if (!(isFilled(cut.text) || isFilled(cut.claim))) problems.push(`${label} needs a non-empty text or claim`);
  return problems;
}

function cutProblems(cut, index) {
  const label = `approvedCuts[${index}]`;
  return isRecord(cut) ? cutFieldProblems(cut, label) : [`${label} must be an object`];
}

// Returns the approvals problems as strings; an empty array means well formed.
export function approvalProblems(value) {
  if (!(isRecord(value) && Array.isArray(value.approvedCuts))) {
    return ['approvals must be an object with an "approvedCuts" array'];
  }
  return value.approvedCuts.flatMap(cutProblems);
}

// items: [{ kind, text }]. A text is kept when the rewrite holds it, or when an approved cut holds it.
export function droppedItems(items, rewrite, approvedTexts) {
  const rewriteNorm = normalize(rewrite);
  const cutNorms = approvedTexts.map(normalize);
  return items.filter((item) => {
    const needle = normalize(item.text);
    return needle && !rewriteNorm.includes(needle) && !cutNorms.some((cut) => cut.includes(needle));
  });
}

export function verbatimItems(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => ({ kind: "verbatim", text: line }));
}

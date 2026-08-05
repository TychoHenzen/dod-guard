// Prose-side tokenizing and segmentation for the blind-rewrite overlap gate.
// Deliberately separate from text-tokens.mjs: that module's comment stripper
// deletes any line starting with "#", which in markdown is a heading, not a
// comment. Prose needs headings and list items kept as sentence-level units.

import { splitSentences } from "./sentence-split.mjs";

const FENCE_PATTERN = /```[\s\S]*?```/g;
const INDENTED_CODE_PATTERN = /^(?: {4,}|\t)/;
const HEADING_PATTERN = /^#{1,6}\s+/;
const LIST_ITEM_PATTERN = /^(?:[-*+]|\d+\.)\s+/;
const WORD_PATTERN = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;

// Removes fenced ``` blocks and 4-space/tab indented code blocks before any
// segmentation runs. Code inside a prose document is not prose.
function stripCodeBlocks(text) {
  const withoutFences = text.replace(FENCE_PATTERN, "\n");
  return withoutFences
    .split("\n")
    .map((line) => (INDENTED_CODE_PATTERN.test(line) ? "" : line))
    .join("\n");
}

function isStandaloneLine(line) {
  return HEADING_PATTERN.test(line) || LIST_ITEM_PATTERN.test(line);
}

function flushBuffer(blocks, buffer) {
  if (buffer.length === 0) {
    return;
  }
  blocks.push({ standalone: false, text: buffer.join(" ").trim() });
}

// Groups lines into standalone units (headings, list items) and paragraph
// blocks of ordinary text joined by a single space each.
function groupBlocks(lines) {
  const blocks = [];
  let buffer = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushBuffer(blocks, buffer);
      buffer = [];
      continue;
    }
    if (isStandaloneLine(line)) {
      flushBuffer(blocks, buffer);
      buffer = [];
      blocks.push({ standalone: true, text: line });
      continue;
    }
    buffer.push(line);
  }
  flushBuffer(blocks, buffer);
  return blocks;
}

export function proseTokens(text, whitelist = []) {
  const banned = new Set(whitelist.map((word) => word.toLowerCase()));
  const stripped = stripCodeBlocks(text).toLowerCase();
  const tokens = stripped.match(WORD_PATTERN) ?? [];
  return tokens.filter((token) => !banned.has(token));
}

export function sentences(text) {
  const blocks = groupBlocks(stripCodeBlocks(text).split("\n"));
  const result = [];
  for (const block of blocks) {
    if (block.standalone) {
      result.push(block.text);
      continue;
    }
    result.push(...splitSentences(block.text));
  }
  return result.filter(Boolean);
}

export function paragraphs(text) {
  return stripCodeBlocks(text)
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function jaccard(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

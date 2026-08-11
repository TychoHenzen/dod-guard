// Comment rules: deferred markers, commented-out code, and comments that
// cost the reader more than the code they sit on.

import { severityFor } from "./config.mjs";
import { push } from "./violations.mjs";

const TODO_MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;
const ASSUMPTION_MARKER = /\bASSUMPTION\b/;
const CODE_IN_COMMENT = /^[^\w]*(if|for|while|return|const|let|var|function|def|public|private|import|await)\b/;
/**
 * Commented-out code has to both start like a statement and end like one.
 * Prose that quotes a keyword ("`const name = (` is the arrow form") ends in
 * punctuation, not a terminator, so it stays out of the results.
 */
const CODE_TAIL = /[;{}[\]),]\s*$/;
/** Doc comments describe code. They are never commented-out code. */
const DOC_COMMENT = /^(\/\*\*|\/\/\/|"""|''')/;

/** Shortest comment block that can be called bloated, in lines. */
const BLOAT_FLOOR = 5;
/** A restatement is short by nature. A longer block is judged on bulk. */
const RESTATE_MAX_LINES = 2;
/**
 * Share of a comment's content words that must also appear in the code below
 * it. Three quarters, not two thirds. At two thirds a sentence still fires
 * when it restates the name and then adds one real fact. This rule is tuned
 * to stay quiet rather than to catch every case.
 */
const RESTATE_SHARE = 0.75;
/** Code lines a restating comment is compared against. */
const RESTATE_WINDOW = 3;

/**
 * Words too common to carry meaning either way. Short words drop out on
 * length, so this only has to name the long ones.
 */
const STOPWORDS = new Set(["the", "this", "that", "these", "those", "with", "from", "into", "which", "when", "then"]);

function stem(word) {
  for (const suffix of ["ies", "ing", "ed", "es", "s"]) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Content words of prose or of code, with camelCase and snake_case split apart. */
function contentWords(text) {
  const tokens = text.match(/[A-Z]+(?![a-z])|[A-Za-z][a-z]+/g) ?? [];
  return tokens.map((token) => stem(token.toLowerCase())).filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function countLines(text) {
  return (text.match(/\n/g) ?? []).length + 1;
}

/**
 * Consecutive comment lines merged into one block. A comment sitting after
 * code on its own line is skipped. The code beside it is what the reader is
 * reading, so the comment documents nothing on its own.
 */
export function commentBlocks(comments, codeLines) {
  const blocks = [];
  for (const comment of comments) {
    if ((codeLines[comment.line - 1] ?? "").trim() !== "") continue;
    const end = comment.line + countLines(comment.text) - 1;
    if (extendBlock(blocks.at(-1), comment, end)) continue;
    blocks.push({ start: comment.line, end, text: comment.text });
  }
  return blocks;
}

/** Fold a comment into the block right above it, when there is one. */
function extendBlock(last, comment, end) {
  if (last === undefined || comment.line !== last.end + 1) return false;
  last.end = end;
  last.text += `\n${comment.text}`;
  return true;
}

/**
 * A line that only closes a bracket belongs to the item that opened it. That
 * item encloses the comment. It is not the item below it. So the last field
 * of a struct is one line, not two.
 */
const CLOSER_ONLY = /^[\s)\]};,]*$/;

/** Non-blank code lines right below a block: the declaration it documents. */
function unitLines(codeLines, block) {
  let count = 0;
  for (let i = block.end; i < codeLines.length; i += 1) {
    if (CLOSER_ONLY.test(codeLines[i])) break;
    count += 1;
  }
  return count;
}

/**
 * A comment that outweighs its own declaration. The ratio is the measure,
 * not the length. Ten lines over a forty-line function is an explanation.
 * Ten lines over a one-line field is an essay nobody asked for.
 */
function checkBloat(ctx, block, unit) {
  const lines = block.end - block.start + 1;
  if (lines < BLOAT_FLOOR) return;
  const severity = severityFor(ctx.config, "comment-bloat", lines / unit);
  const message = `${lines}-line comment over ${unit} line(s) of code - keep the why, cut the rest`;
  push(ctx.out, ctx.file, block.start, "comment-bloat", severity, message, lines);
}

/**
 * A comment that says again what the declaration below it already says. The
 * name is the what. A comment earns its place by giving the why.
 */
function checkRestatement(ctx, block) {
  if (block.end - block.start + 1 > RESTATE_MAX_LINES) return;
  const said = contentWords(block.text);
  if (said.length < 2) return;
  const window = ctx.codeLines.slice(block.end, block.end + RESTATE_WINDOW).join(" ");
  const declared = new Set(contentWords(window));
  const shared = said.filter((word) => declared.has(word)).length;
  if (shared / said.length < RESTATE_SHARE) return;
  const severity = ctx.config.presence["comment-restates-code"];
  const message = "comment repeats the declaration below it - say why, not what";
  push(ctx.out, ctx.file, block.start, "comment-restates-code", severity, message, 1);
}

/** A named guess measures a different thing than a deferred marker, so it never returns early. */
function checkAssumptionMarker(ctx, body, at) {
  if (!ASSUMPTION_MARKER.test(body)) return;
  const marker = ctx.config.presence["assumption-marker"];
  push(ctx.out, ctx.file, at, "assumption-marker", marker, `unverified guess: ${body.slice(0, 60)}`, 1);
}

function checkMarkerOrDeadCode(ctx, comment) {
  const body = comment.text.replace(/^[\s/*#]+|[\s*/]+$/g, "");
  const at = comment.line;
  checkAssumptionMarker(ctx, body, at);
  if (TODO_MARKER.test(body)) {
    const marker = ctx.config.presence["todo-marker"];
    push(ctx.out, ctx.file, at, "todo-marker", marker, `unresolved marker: ${body.slice(0, 60)}`, 1);
    return;
  }
  if (DOC_COMMENT.test(comment.text.trim())) return;
  if (!CODE_IN_COMMENT.test(body) || !CODE_TAIL.test(body)) return;
  const severity = ctx.config.presence["commented-out-code"];
  push(ctx.out, ctx.file, at, "commented-out-code", severity, `commented-out code: ${body.slice(0, 60)}`, 1);
}

/**
 * Module preamble: a package, import or include line. A comment above one is
 * a file header. A file header speaks for the whole module. It does not
 * speak for the line that happens to follow it.
 */
const PREAMBLE = /^\s*(package|import|from|use|using|namespace|module|require|#include|#!)\b/;

function checkBlock(ctx, block) {
  if (PREAMBLE.test(ctx.codeLines[block.end] ?? "")) return;
  // A block with no code under it documents nothing measurable: a file
  // header, a licence, a section banner. Both rules below need a subject.
  const unit = unitLines(ctx.codeLines, block);
  if (unit === 0) return;
  checkBloat(ctx, block, unit);
  checkRestatement(ctx, block);
}

export function checkComments(file, config, comments, codeLines, out) {
  const ctx = { file, config, codeLines, out };
  for (const comment of comments) checkMarkerOrDeadCode(ctx, comment);
  for (const block of commentBlocks(comments, codeLines)) checkBlock(ctx, block);
}

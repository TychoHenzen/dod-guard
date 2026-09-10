import { severityFor } from "./config.mjs";
import { push } from "./violations.mjs";
import { contentWords } from "./rules-comments-text.mjs";
const BLOAT_FLOOR = 5;
const RESTATE_MAX_LINES = 2;
const RESTATE_SHARE = 0.75;
const RESTATE_WINDOW = 3;
const CLOSER_ONLY = /^[\s)\]};,]*$/;
const PREAMBLE =
  /^\s*(package|import|from|use|using|namespace|module|require|#include|#!)\b/;
function countLines(text) {
  return (text.match(/\n/g) ?? []).length + 1;
}
function extendBlock(last, comment, end) {
  if (last === undefined || comment.line !== last.end + 1) return false;
  last.end = end;
  last.text += "\n" + comment.text;
  return true;
}
function blockFor(comment, codeLines) {
  if ((codeLines[comment.line - 1] ?? "").trim() !== "") return null;
  return {
    start: comment.line,
    end: comment.line + countLines(comment.text) - 1,
    text: comment.text,
  };
}

export function commentBlocks(comments, codeLines) {
  const blocks = [];
  for (const comment of comments) {
    const block = blockFor(comment, codeLines);
    if (block && !extendBlock(blocks.at(-1), comment, block.end))
      blocks.push(block);
  }
  return blocks;
}

function unitLines(codeLines, block) {
  let count = 0;
  for (let i = block.end; i < codeLines.length; i += 1) {
    if (CLOSER_ONLY.test(codeLines[i])) break;
    count += 1;
  }
  return count;
}

function checkBloat(ctx, block, unit) {
  const lines = block.end - block.start + 1;
  if (lines < BLOAT_FLOOR) return;
  const severity = severityFor(ctx.config, "comment-bloat", lines / unit);
  const message =
    lines +
    "-line comment over " +
    unit +
    " line(s) of code - keep the why, cut the rest";
  push({
    out: ctx.out,
    file: ctx.file,
    line: block.start,
    rule: "comment-bloat",
    severity,
    message,
    metric: lines,
  });
}

function checkRestatement(ctx, block) {
  if (block.end - block.start + 1 > RESTATE_MAX_LINES) return;
  const said = contentWords(block.text);
  if (said.length < 2) return;
  const window = ctx.codeLines
    .slice(block.end, block.end + RESTATE_WINDOW)
    .join(" ");
  const declared = new Set(contentWords(window));
  const shared = said.filter((word) => declared.has(word)).length;
  if (shared / said.length < RESTATE_SHARE) return;
  const severity = ctx.config.presence["comment-restates-code"];
  const message =
    "comment repeats the declaration below it - say why, not what";
  push({
    out: ctx.out,
    file: ctx.file,
    line: block.start,
    rule: "comment-restates-code",
    severity,
    message,
    metric: 1,
  });
}

export function checkBlock(ctx, block) {
  if (PREAMBLE.test(ctx.codeLines[block.end] ?? "")) return;
  const unit = unitLines(ctx.codeLines, block);
  if (unit === 0) return;
  checkBloat(ctx, block, unit);
  checkRestatement(ctx, block);
}

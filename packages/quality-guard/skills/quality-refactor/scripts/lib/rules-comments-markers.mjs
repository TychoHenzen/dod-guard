import { push } from "./violations.mjs";
import { commentBody } from "./rules-comments-text.mjs";
import { checkCommentedOutCode } from "./rules-comments/code.mjs";

const TODO_MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;
const ASSUMPTION_MARKER = /\bASSUMPTION\b/;
const METADATA_COMMENT =
  /^(?:@(?:author|version|since|date|history)\b|(?:created|last\s+modified|updated)\s+by\b)/i;
const PLACEHOLDER_COMMENT = /^(?:(?:tbd|tba|placeholder)\b|\?{3})(?:[:\s-]|$)/i;

function checkMetadata(ctx, body, line) {
  if (!METADATA_COMMENT.test(body)) return;
  push({
    out: ctx.out,
    file: ctx.file,
    line,
    rule: "comment-metadata",
    severity: ctx.config.presence["comment-metadata"],
    message: "metadata/history comment belongs in repository records",
    metric: 1,
  });
}

function checkPlaceholder(ctx, body, line) {
  if (!PLACEHOLDER_COMMENT.test(body)) return;
  push({
    out: ctx.out,
    file: ctx.file,
    line,
    rule: "comment-placeholder",
    severity: ctx.config.presence["comment-placeholder"],
    message: "placeholder comment: replace it with a decision or remove it",
    metric: 1,
  });
}

function checkAssumptionMarker(ctx, body, line) {
  if (!ASSUMPTION_MARKER.test(body)) return;
  push({
    out: ctx.out,
    file: ctx.file,
    line,
    rule: "assumption-marker",
    severity: ctx.config.presence["assumption-marker"],
    message: "unverified guess: " + body.slice(0, 60),
    metric: 1,
  });
}

function checkTodoMarker(ctx, body, line) {
  if (!TODO_MARKER.test(body)) return false;
  push({
    out: ctx.out,
    file: ctx.file,
    line,
    rule: "todo-marker",
    severity: ctx.config.presence["todo-marker"],
    message: "unresolved marker: " + body.slice(0, 60),
    metric: 1,
  });
  return true;
}

export function checkMarkerOrDeadCode(ctx, comment) {
  for (const [offset, line] of comment.text.split(/\r?\n/).entries()) {
    const body = commentBody({ text: line });
    const lineNumber = comment.line + offset;
    checkMetadata(ctx, body, lineNumber);
    checkPlaceholder(ctx, body, lineNumber);
    checkAssumptionMarker(ctx, body, lineNumber);
    if (checkTodoMarker(ctx, body, lineNumber)) continue;
    checkCommentedOutCode(ctx, body, { ...comment, line: lineNumber });
  }
}

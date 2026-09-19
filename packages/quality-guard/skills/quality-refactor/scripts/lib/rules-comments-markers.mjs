import { push } from "./violations.mjs";

const TODO_MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;
const ASSUMPTION_MARKER = /\bASSUMPTION\b/;
const CODE_IN_COMMENT = new RegExp(
  "^[^\\w]*(if|for|while|return|const|let|var|function|def|" +
    "public|private|import|await)\\b",
);
const CODE_TAIL = /[;{}[\]),]\s*$/;
const DOC_COMMENT = /^(\/\*\*|\/\/\/|\x22{3}|\x27{3})/;
const METADATA_COMMENT =
  /^(?:@(?:author|version|since|date|history)\b|(?:created|last\s+modified|updated)\s+by\b)/i;
const PLACEHOLDER_COMMENT = /^(?:tbd|tba|\?{3}|placeholder)\b[:\s-]*/i;

function commentBody(comment) {
  return comment.text.replace(/^[\s/*#]+|[\s*/]+$/g, "").trim();
}

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
  const severity = ctx.config.presence["assumption-marker"];
  const message = "unverified guess: " + body.slice(0, 60);
  push({
    out: ctx.out,
    file: ctx.file,
    line,
    rule: "assumption-marker",
    severity,
    message,
    metric: 1,
  });
}

function checkTodoMarker(ctx, body, line) {
  if (TODO_MARKER.test(body)) {
    const severity = ctx.config.presence["todo-marker"];
    const message = "unresolved marker: " + body.slice(0, 60);
    push({
      out: ctx.out,
      file: ctx.file,
      line,
      rule: "todo-marker",
      severity,
      message,
      metric: 1,
    });
    return true;
  }
  return false;
}

function checkCommentedOutCode(ctx, body, comment) {
  if (DOC_COMMENT.test(comment.text.trim())) return;
  if (!CODE_IN_COMMENT.test(body) || !CODE_TAIL.test(body)) return;
  const line = comment.line;
  const severity = ctx.config.presence["commented-out-code"];
  const message = "commented-out code: " + body.slice(0, 60);
  push({
    out: ctx.out,
    file: ctx.file,
    line,
    rule: "commented-out-code",
    severity,
    message,
    metric: 1,
  });
}

export function checkMarkerOrDeadCode(ctx, comment) {
  const body = commentBody(comment);
  checkMetadata(ctx, body, comment.line);
  checkPlaceholder(ctx, body, comment.line);
  checkAssumptionMarker(ctx, body, comment.line);
  if (checkTodoMarker(ctx, body, comment.line)) return;
  checkCommentedOutCode(ctx, body, comment);
}

import { push } from "../violations.mjs";

const CODE_IN_COMMENT = new RegExp(
  "^[^\\w]*(if|for|while|return|const|let|var|function|def|" +
    "public|private|import|await)\\b",
);
const CODE_TAIL = /[;{}[\]),]\s*$/;
const DOC_COMMENT = /^(\/\*\*|\/\/\/|\x22{3}|\x27{3})/;

export function checkCommentedOutCode(ctx, body, comment) {
  if (DOC_COMMENT.test(comment.text.trim())) return;
  if (!CODE_IN_COMMENT.test(body) || !CODE_TAIL.test(body)) return;
  push({
    out: ctx.out,
    file: ctx.file,
    line: comment.line,
    rule: "commented-out-code",
    severity: ctx.config.presence["commented-out-code"],
    message: "commented-out code: " + body.slice(0, 60),
    metric: 1,
  });
}

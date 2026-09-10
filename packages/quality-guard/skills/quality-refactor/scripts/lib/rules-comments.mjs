import { checkBlock, commentBlocks } from "./rules-comments-analysis.mjs";
import { checkMarkerOrDeadCode } from "./rules-comments-markers.mjs";

export function checkComments({ file, config, comments, codeLines, out }) {
  const ctx = { file, config, codeLines, out };
  for (const comment of comments) checkMarkerOrDeadCode(ctx, comment);
  for (const block of commentBlocks(comments, codeLines))
    checkBlock(ctx, block);
}

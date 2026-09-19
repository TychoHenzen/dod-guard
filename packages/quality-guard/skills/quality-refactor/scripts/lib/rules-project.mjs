import { checkDuplication } from "./rules-duplicate.mjs";
import { checkEnvironment, resolveEntrypoints } from "./rules-project/environment.mjs";
import { checkReachability } from "./rules-reachability.mjs";
import { checkCommentReferences } from "./rules-comments-project.mjs";

export {
  checkCommentReferences,
  checkDuplication,
  checkEnvironment,
  checkReachability,
  resolveEntrypoints,
};

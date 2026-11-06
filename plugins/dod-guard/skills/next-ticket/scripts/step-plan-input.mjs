// Reads the --plans file of handoff-proof.mjs refinement and runs its proxy checks over the checkout at --root.
import { parseStepPlans } from "../../../lib/step-plan-parse.mjs";
import { searchPlans } from "../../../lib/step-plan-search.mjs";
import { readText, UsageError } from "./handoff-proof-cli.mjs";

const NO_HEADING = "--plans file holds no '## Step plan: <task-id>' heading";
const ROOT_WITHOUT_PLANS = "--root only applies with --plans";
const PLANS_WITHOUT_ROOT = "--plans needs --root=<dir>, the checkout the plans' paths resolve in";

function withoutPlans(root) {
  if (root !== undefined) {
    throw new UsageError(ROOT_WITHOUT_PLANS);
  }
  return [];
}

// Returns the parsed plans with each proxy's search result, or [] when no --plans file was given.
function readPlans({ plans: file, root }) {
  if (file === undefined) {
    return withoutPlans(root);
  }
  if (root === undefined) {
    throw new UsageError(PLANS_WITHOUT_ROOT);
  }
  const parsed = parseStepPlans(readText(file, "plans"));
  if (parsed.length === 0) {
    throw new UsageError(NO_HEADING);
  }
  return searchPlans(parsed, root);
}

export { readPlans };

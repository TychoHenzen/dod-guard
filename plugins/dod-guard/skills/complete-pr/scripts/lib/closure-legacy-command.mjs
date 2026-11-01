// The closure.mjs record-legacy subcommand: it checks the options, then hands the delivery to the guard.
import { REPOSITORY_NAME } from "../../../../lib/repository-identity.mjs";
import { recordLegacyDelivery } from "./closure-legacy.mjs";
import { positiveInteger } from "./closure-options.mjs";
import { runGh } from "./gh-runner.mjs";

// The options only the structured record path takes; record-legacy refuses any of them.
const STRUCTURED_ONLY_OPTIONS = ["children", "matrix", "result", "handoff-file"];

function hasNoStructuredOptions(args) {
  return STRUCTURED_ONLY_OPTIONS.every((name) => args[name] === undefined);
}

function isRepositoryName(value) {
  return REPOSITORY_NAME.test(value ?? "");
}

// The inputs record-legacy takes, or null when an option is missing, malformed, or structured-only.
function legacyInputs(args) {
  const pull = positiveInteger(args.pull);
  const issue = positiveInteger(args.issue);
  if (!(pull && issue && hasNoStructuredOptions(args) && isRepositoryName(args.repository))) {
    return null;
  }
  return { repository: args.repository, pull, issue };
}

function recordLegacy(args, runner = runGh) {
  const inputs = legacyInputs(args);
  if (inputs === null) {
    return false;
  }
  return recordLegacyDelivery({ ...inputs, runner });
}

export { recordLegacy };

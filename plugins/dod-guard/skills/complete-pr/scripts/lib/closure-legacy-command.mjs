// The closure.mjs record-legacy and record-ordinary subcommands: each checks the options, then hands the
// delivery to the shared guard.
import { REPOSITORY_NAME } from "../../../../lib/repository-identity.mjs";
import { recordLegacyDelivery, recordOrdinaryDelivery } from "./closure-legacy.mjs";
import { positiveInteger } from "./closure-options.mjs";
import { runGh } from "./gh-runner.mjs";

// The options only the structured record path takes; both subcommands refuse any of them.
const STRUCTURED_ONLY_OPTIONS = ["children", "matrix", "result", "handoff-file"];

function hasNoStructuredOptions(args) {
  return STRUCTURED_ONLY_OPTIONS.every((name) => args[name] === undefined);
}

function isRepositoryName(value) {
  return REPOSITORY_NAME.test(value ?? "");
}

// The inputs both subcommands take, or null when an option is missing, malformed, or structured-only.
function unstructuredInputs(args) {
  const pull = positiveInteger(args.pull);
  const issue = positiveInteger(args.issue);
  if (!(pull && issue && hasNoStructuredOptions(args) && isRepositoryName(args.repository))) {
    return null;
  }
  return { repository: args.repository, pull, issue };
}

function commandFor(recordDelivery) {
  return (args, runner = runGh) => {
    const inputs = unstructuredInputs(args);
    if (inputs === null) {
      return false;
    }
    return recordDelivery({ ...inputs, runner });
  };
}

const recordLegacy = commandFor(recordLegacyDelivery);
const recordOrdinary = commandFor(recordOrdinaryDelivery);

export { recordLegacy, recordOrdinary };

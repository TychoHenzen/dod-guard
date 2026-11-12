// Reads handoff-build.mjs's command line and the files it names. Every refusal is a UsageError,
// which the CLI reports with USAGE and exit status 2.
import { parseArgs } from "../../../lib/args.mjs";
import { isPlainObject } from "../../../lib/handoff-values.mjs";
import { checkCarryForward } from "./carry-forward-check.mjs";
import { readText, UsageError } from "./handoff-proof-cli.mjs";

const USAGE =
  "usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>" +
  // biome-ignore lint/security/noSecrets: the usage text is a plain string with no credential in it.
  " [--previous-handoff-file=<handoff.md>] [--root=<checkout>]\n" +
  "--root is required when an evidence row declares a carryForward\n";

const OPTIONS = Object.freeze({ "body-file": "issue-body.md", "evidence-file": "evidence.json", "head-sha": "sha" });
const OPTIONAL = Object.freeze({ "previous-handoff-file": "handoff.md", root: "dir" });

function isKnown(name) {
  return Object.hasOwn(OPTIONS, name) || Object.hasOwn(OPTIONAL, name);
}

// An option given without a value parses as "true" or "", and neither names a
// file or a head.
function hasValue(options, name) {
  return Boolean(options[name]) && options[name] !== "true";
}

function unknownProblem(options) {
  const unknown = Object.keys(options).find((name) => !isKnown(name));
  return unknown && `unknown option --${unknown}`;
}

function missingProblem(options) {
  const missing = Object.entries(OPTIONS).find(([name]) => !hasValue(options, name));
  return missing && `--${missing[0]}=<${missing[1]}> is required`;
}

function bareProblem(options) {
  const bare = Object.keys(OPTIONAL).find((name) => Object.hasOwn(options, name) && !hasValue(options, name));
  return bare && `--${bare}=<${OPTIONAL[bare]}> needs a value`;
}

function optionsFrom(argv) {
  const options = parseArgs(argv);
  if (options === null) {
    throw new UsageError("options must be --name=value flags");
  }
  const problem = unknownProblem(options) || missingProblem(options) || bareProblem(options);
  if (problem) {
    throw new UsageError(problem);
  }
  return options;
}

// The previous handoff is optional; an absent option reads as a handoff with no checkpoint.
function previousHandoffText(options) {
  const file = options["previous-handoff-file"];
  if (file === undefined) {
    return "";
  }
  return readText(file, "previous-handoff-file");
}

// A carry-forward is checked against a checkout; without --root, build() refuses every one.
function carryCheckFor({ root }) {
  if (root === undefined) {
    return;
  }
  return (request) => checkCarryForward({ root, ...request });
}

function readEvidence(file) {
  let evidence;
  try {
    evidence = JSON.parse(readText(file, "evidence-file"));
  } catch (error) {
    if (error instanceof UsageError) {
      throw error;
    }
    throw new UsageError("--evidence-file is not valid JSON", { cause: error });
  }
  if (!(Array.isArray(evidence?.tasks) && isPlainObject(evidence?.rows))) {
    throw new UsageError("--evidence-file must hold tasks[] and rows{}");
  }
  return evidence;
}

// The arguments build() takes, read from the command line.
function readBuildInput(argv) {
  const options = optionsFrom(argv);
  return {
    body: readText(options["body-file"], "body-file"),
    evidence: readEvidence(options["evidence-file"]),
    headSha: options["head-sha"],
    previousHandoff: previousHandoffText(options),
    carryCheck: carryCheckFor(options),
  };
}

export { readBuildInput, USAGE };

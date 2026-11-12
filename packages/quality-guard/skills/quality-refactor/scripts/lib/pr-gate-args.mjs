// Reads the gate's command line into an options object.
import { FLAGS, isSeverity } from "./pr-gate-flags.mjs";
import { GENERATED_PATHS } from "./pr-gate-paths.mjs";

const DEFAULTS = { blockOn: "medium", fixMediumHigh: 1, fixLow: 3 };

function applyArg(options, arg) {
  const prefix = Object.keys(FLAGS).find((flag) => arg.startsWith(flag));
  if (prefix === undefined) {
    options.error = `unknown argument: ${arg}`;
    return;
  }
  FLAGS[prefix](options, arg.slice(prefix.length));
}

export function parseArgs(argv) {
  const options = {
    base: undefined,
    excludes: [...GENERATED_PATHS],
    ruleBlockOn: {},
    error: undefined,
    ...DEFAULTS,
  };
  for (const arg of argv) applyArg(options, arg);
  validateOptions(options);
  return options;
}

function validateOptions(options) {
  if (options.error) return;
  if (!options.base) {
    options.error = "--base=<ref> is required";
    return;
  }
  if (!isSeverity(options.blockOn))
    options.error = "--block-on must be low, medium or high";
}

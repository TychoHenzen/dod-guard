import { existsSync } from "node:fs";
import { ALL_RULES } from "./lib/config.mjs";
import { USAGE } from "./quality-scan-usage.mjs";
import { FLAG_HANDLERS } from "./quality-scan-flags.mjs";
export { USAGE };
function defaultOptions() {
  return {
    paths: [],
    format: "text",
    profile: "default",
    rules: null,
    excludes: [],
    testPaths: [],
    root: process.cwd(),
    top: 15,
    writeBaseline: null,
    baseline: null,
    failOn: "none",
  };
}
function parseFlag(options, arg) {
  const [flag, value = ""] = arg.slice(2).split(/=(.*)/s);
  if (flag === "help") return { help: true };
  const handler = FLAG_HANDLERS[flag];
  if (!handler) return { error: `unknown option: --${flag}` };
  handler(options, value);
  return null;
}
export function parseArgs(argv) {
  const options = defaultOptions();
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      options.paths.push(arg);
      continue;
    }
    const result = parseFlag(options, arg);
    if (result) return result;
  }
  if (options.paths.length === 0) options.paths.push(".");
  return options;
}
function invalidChoice(options) {
  const choices = [
    ["format", ["text", "json", "units"]],
    ["profile", ["default", "strict"]],
    ["failOn", ["none", "error", "regression", "any"]],
  ];
  const invalid = choices.find(
    ([key, values]) => !values.includes(options[key]),
  );
  return invalid
    ? `bad --${invalid[0].replace("failOn", "fail-on")}: ${options[invalid[0]]}`
    : null;
}

function validateRules(options) {
  const unknown = (options.rules ?? []).filter(
    (rule) => !ALL_RULES.includes(rule),
  );
  return unknown.length > 0 ? `unknown rules: ${unknown.join(", ")}` : null;
}

export function validate(options) {
  const choiceError = invalidChoice(options);
  if (choiceError) return choiceError;
  const ruleError = validateRules(options);
  if (ruleError) return ruleError;
  if (options.baseline && !existsSync(options.baseline))
    return `baseline not found: ${options.baseline}`;
  return null;
}

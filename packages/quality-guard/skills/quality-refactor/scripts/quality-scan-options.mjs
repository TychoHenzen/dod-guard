import { ALL_RULES } from "./lib/config.mjs";
import { USAGE } from "./quality-scan-usage.mjs";
import { FLAG_HANDLERS } from "./quality-scan-flags.mjs";
export { USAGE };
function defaultOptions() {
  return {
    paths: [],
    format: "text",
    profile: "advisory",
    rules: null,
    excludes: [],
    testPaths: [],
    root: process.cwd(),
    top: 15,
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
    ["profile", ["advisory", "default", "strict"]],
  ];
  const invalid = choices.find(
    ([key, values]) => !values.includes(options[key]),
  );
  return invalid
    ? `bad --${invalid[0]}: ${options[invalid[0]]}`
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
  return null;
}

import { ALL_RULES } from "./lib/config.mjs";
import { isAttributeName } from "./lib/exclusion-config.mjs";
import { USAGE } from "./quality-scan-usage.mjs";
import { FLAG_HANDLERS } from "./quality-scan-flags.mjs";
export { USAGE };
function defaultOptions() {
  return {
    paths: [],
    format: "text",
    rules: null,
    excludes: [],
    testPaths: [],
    registeredAttributes: [],
    root: process.cwd(),
    noConfig: false,
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

function validateAttributes(options) {
  const bad = options.registeredAttributes.find(
    (name) => !isAttributeName(name),
  );
  if (bad === undefined) {
    return null;
  }
  return `bad --registered-attribute: ${bad}`;
}

export function validate(options) {
  return (
    invalidChoice(options) ??
    validateRules(options) ??
    validateAttributes(options)
  );
}

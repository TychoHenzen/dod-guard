import { resolve } from "node:path";

export const FLAG_HANDLERS = {
  format: (options, value) => {
    options.format = value;
  },
  profile: (options, value) => {
    options.profile = value;
  },
  rules: (options, value) => {
    options.rules = value.split(",").filter(Boolean);
  },
  exclude: (options, value) => options.excludes.push(value),
  "test-path": (options, value) => options.testPaths.push(value),
  root: (options, value) => {
    options.root = resolve(value);
  },
  top: (options, value) => {
    options.top = Number.parseInt(value, 10) || 15;
  },
  "write-baseline": (options, value) => {
    options.writeBaseline = value;
  },
  baseline: (options, value) => {
    options.baseline = value;
  },
  "fail-on": (options, value) => {
    options.failOn = value;
  },
};

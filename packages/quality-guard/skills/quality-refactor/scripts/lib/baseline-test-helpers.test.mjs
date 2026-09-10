import { buildBaseline } from "./baseline.mjs";

export function violation(file, rule) {
  return { file, rule, line: 1, severity: "warn", message: rule };
}

export function baselineOf(violations, files) {
  return buildBaseline(violations, "default", files);
}

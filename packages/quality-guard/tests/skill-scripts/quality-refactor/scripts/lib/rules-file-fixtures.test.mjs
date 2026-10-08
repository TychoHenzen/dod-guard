import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";

export function rustFile(rel, code) {
  return {
    rel,
    lang: "rs",
    isTest: false,
    source: code,
    lines: code.split("\n"),
  };
}

export function csFile(rel, code) {
  return {
    rel,
    lang: "cs",
    isTest: false,
    source: code,
    lines: code.split("\n"),
  };
}

export function tsFile(rel, code) {
  return {
    rel,
    lang: "ts",
    isTest: false,
    source: code,
    lines: code.split("\n"),
  };
}

export function scanViolations(file) {
  return scanFile(file, buildConfig()).violations;
}

export function tupleViolations(file) {
  return scanViolations(file).filter(
    (violation) => violation.rule === "unnamed-tuple",
  );
}

export function statelessViolations(code) {
  return scanViolations(rustFile("src/lib.rs", code)).filter(
    (violation) => violation.rule === "stateless-method",
  );
}

export function complexityFor(code) {
  const config = buildConfig();
  config.thresholds = {
    ...config.thresholds,
    complexity: { medium: 0, high: 0 },
  };
  const found = scanFile(rustFile("src/lib.rs", code), config).violations;
  return found.find((violation) => violation.rule === "complexity").metric;
}

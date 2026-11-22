// The scanner judges every repository at its built-in severities. A reviewed
// repository's CI step that runs quality-pr-gate may pass `--rule-block-on`
// floors that let a rule's lower severities through. The review applies those
// floors to the scan, so it never reports what the repository's own gate was
// told to accept. Line widths need nothing here: the scanner reads
// `.editorconfig` itself, the same way the gate sees it.

// biome-ignore lint/correctness/noNodejsModules: This skill helper reads repository files under Node.js.
import { existsSync, readdirSync, readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper reads repository files under Node.js.
import { join } from "node:path";

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

// The text of each step that runs quality-pr-gate, without comment lines, so a
// flag quoted in a YAML comment is never read as one the gate receives.
function gateSteps(workflow) {
  const text = workflow
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    // A " #" starts a YAML or shell comment, so a flag after it is never passed.
    .map((line) => line.replace(/\s#.*$/, ""))
    .join("\n");
  const steps = [];
  let start = text.indexOf("quality-pr-gate.mjs");
  while (start !== -1) {
    const next = text.slice(start).search(/\n\s*- /);
    steps.push(next === -1 ? text.slice(start) : text.slice(start, start + next));
    start = text.indexOf("quality-pr-gate.mjs", start + 1);
  }
  return steps;
}

// ASSUMPTION: only per-rule `--rule-block-on` floors are applied. They state a
// rule's real limit (for example file length past 300 lines); the global
// `--block-on` is a merge policy over every rule, so the review keeps findings
// below it.
function gateRuleFloors(workflows) {
  const floors = {};
  for (const step of workflows.flatMap(gateSteps)) {
    for (const match of step.matchAll(/--rule-block-on=([\w-]+):(low|medium|high)\b/g)) {
      floors[match[1]] = match[2];
    }
  }
  return floors;
}

function belowFloor(violation, floors) {
  const floor = floors[violation.rule];
  return floor !== undefined && SEVERITY_RANK[violation.severity] < SEVERITY_RANK[floor];
}

function applyRepoLimits(scan, { floors }) {
  const removed = {};
  const kept = [];
  for (const violation of scan.violations) {
    if (!belowFloor(violation, floors)) {
      kept.push(violation);
      continue;
    }
    removed[violation.rule] = (removed[violation.rule] ?? 0) + 1;
  }
  return { scan: { ...scan, violations: kept }, removed };
}

function repoLimits(root) {
  const directory = join(root, ".github", "workflows");
  const names = existsSync(directory) ? readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)) : [];
  const floors = gateRuleFloors(names.map((name) => readFileSync(join(directory, name), "utf8")));
  return { floors };
}

export { applyRepoLimits, gateRuleFloors, repoLimits };

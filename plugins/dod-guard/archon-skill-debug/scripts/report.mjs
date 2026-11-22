// The report step: the pull request body. It names findings, causes and files
// only: quoted trace lines stay in the local artifacts, never in a public write.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./common.mjs";
import { statePath } from "./edits.mjs";

function loadResults(dir) {
  return existsSync(statePath(dir)) ? readJson(statePath(dir)).results : {};
}

function resultDetail(result) {
  if (result?.commit) {
    return ` in ${result.commit.slice(0, 10)}`;
  }
  if (result?.reason) {
    return `: ${result.reason}`;
  }
  return "";
}

function findingLine(finding, result) {
  const status = result ? result.status : "not accepted";
  return `- ${finding.title} (${finding.cause}, ${finding.file}): ${status}${resultDetail(result)}`;
}

function findingLines(items, results) {
  const lines = items.findings.map((finding) => findingLine(finding, results[finding.id]));
  if (items.findings.length === 0) {
    lines.push("- No finding was offered.");
  }
  for (const entry of items.rejected) {
    lines.push(`- ${entry.title}: not offered, ${entry.problem}`);
  }
  return lines;
}

function holdsIfApplied(finding, results) {
  return Boolean(results[finding.id]?.commit) && finding.expect !== "";
}

function expectationLines(items, results) {
  const expected = items.findings.filter((finding) => holdsIfApplied(finding, results));
  if (expected.length === 0) {
    return [];
  }
  return [
    "",
    "### If the applied fixes hold",
    "",
    ...expected.map((finding) => `- ${finding.title}: ${finding.expect}`),
  ];
}

export function report({ dir }) {
  const items = readJson(join(dir, "items.json"));
  const { skill, traces } = readJson(join(dir, "traces.json"));
  const results = loadResults(dir);
  const out = [
    `## Skill debug: ${skill}`,
    "",
    `Scored against ${traces.length} past runs.`,
    "",
    "### Findings",
    "",
    ...findingLines(items, results),
    ...expectationLines(items, results),
  ];
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "pr-body.md"), text);
  return text;
}

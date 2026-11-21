// The options step: validate the session's findings.json against the pulled
// traces and the checkout, record what is offered and what is not, and build
// the form the maintainer answers.
import { join } from "node:path";
import { forbidden, git, NONE, readJson, writeJson } from "./common.mjs";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const CITE = /run (\d+) steps? (\d+)(?:\s*-\s*(\d+))?/g;
export const CAUSES = new Set([
  "missing step",
  "ambiguous wording",
  "ignored instruction",
  "escape hatch",
  "broken script",
  "wrong altitude",
  "lost late",
]);

function citeProblem(evidence, traces) {
  const cites = [...String(evidence).matchAll(CITE)];
  if (cites.length === 0) {
    return 'evidence cites no "run <k> steps <a>-<b>"';
  }
  for (const [, k, from, to] of cites) {
    const trace = traces.find((entry) => entry.k === Number(k));
    const last = Number(to ?? from);
    if (!trace) {
      return `evidence cites run ${k}, which was not pulled`;
    }
    if (Number(from) < 1 || last > trace.steps || last < Number(from)) {
      return `evidence cites steps ${from}-${last} of run ${k}, which has ${trace.steps}`;
    }
  }
  return null;
}

function findingProblem(finding, seen, traces, tracked) {
  if (!ID.test(String(finding.id)) || finding.id === NONE || seen.has(finding.id)) {
    return `bad or repeated id ${JSON.stringify(finding.id)}`;
  }
  if (!CAUSES.has(finding.cause)) {
    return `cause ${JSON.stringify(finding.cause)} is not a row of the Causes table`;
  }
  const file = String(finding.file ?? "");
  if (forbidden(file) || !tracked.has(file) || !file.endsWith(".md")) {
    return `file ${JSON.stringify(file)} is not a tracked Markdown file of this checkout`;
  }
  if (String(finding.fix ?? "").trim() === "") {
    return "names no fix";
  }
  return citeProblem(finding.evidence, traces);
}

function entryOf(finding) {
  return {
    id: String(finding.id),
    title: String(finding.title ?? finding.id),
    cause: String(finding.cause ?? ""),
    file: String(finding.file ?? ""),
    fix: String(finding.fix ?? ""),
    expect: String(finding.expect ?? "").trim(),
  };
}

function formMessage(dir, findings, rejected) {
  const intro =
    "Pick the findings to apply; each becomes one edit and one commit. " +
    `The full report, with evidence, is in ${join(dir, "report.md")}.`;
  const blocks = findings.map(
    (finding) => `${finding.id}: ${finding.title} (${finding.cause})\n  file: ${finding.file}\n  fix: ${finding.fix}`,
  );
  const rejectedLines = rejected.map((entry) => `${entry.id}: not offered, ${entry.problem}`);
  return [intro, ...blocks, ...rejectedLines].join("\n\n");
}

export function options({ dir, repo }) {
  const { traces } = readJson(join(dir, "traces.json"));
  const raw = readJson(join(dir, "findings.json"));
  const tracked = new Set(git(repo, ["ls-files", "-z"]).split("\0").filter(Boolean));
  const seen = new Set();
  const findings = [];
  const rejected = [];
  for (const finding of Array.isArray(raw.findings) ? raw.findings : []) {
    const problem = findingProblem(finding, seen, traces, tracked);
    seen.add(finding.id);
    const entry = entryOf(finding);
    if (problem) {
      rejected.push({ ...entry, problem });
    } else {
      findings.push(entry);
    }
  }
  writeJson(join(dir, "items.json"), { findings, rejected });
  const choices = findings.map((finding) => ({
    id: finding.id,
    label: finding.title,
    does: `${finding.cause}: edit ${finding.file}`,
  }));
  choices.push({ id: NONE, label: "Accept nothing", does: "end the run with no edit" });
  return {
    options: choices,
    count: String(findings.length),
    message: formMessage(dir, findings, rejected),
  };
}

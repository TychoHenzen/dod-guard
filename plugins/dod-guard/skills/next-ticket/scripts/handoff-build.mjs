#!/usr/bin/env node
// Prints the next-ticket implementation handoff comment from an issue body's
// planned records and an evidence file, so the observed matrix JSON is encoded
// by JSON.stringify and never hand-written.
//
// Usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>
//
// Identity comes from the body, never from the evidence file: each matrix row's
// id, contract, path, proof, expected and evidence ids come from the planned
// acceptance matrix, and each task bullet's id, functional slice and evidence
// ids come from the task list. The evidence file supplies only what was
// observed:
//   {
//     "tasks": [{ "id": "T1", "commit": "<sha>", "files": ["a.mjs"], "result": "text" }],
//     "rows": {
//       "R1": { "observed": "text", "status": "pass" },
//       "R2": { "observed": "text", "status": "inapplicable", "reason": "text" }
//     }
//   }
// Every planned task and row needs one entry, and no entry may name a task or
// row the body does not plan or carry a field other than the ones above. stdout
// is the comment text, which post-push reads as the handoff file. stderr lists
// each problem, one per line, and nothing is printed on stdout then. Exit
// status: 0 built, 1 problems in the body or evidence, 2 usage error.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { evidenceValues } from "./convergence-core.mjs";
import { readText, UsageError } from "./handoff-proof-cli.mjs";

const USAGE =
  "usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>\n";

const OPTIONS = Object.freeze({ "body-file": "issue-body.md", "evidence-file": "evidence.json", "head-sha": "sha" });
// A row whose status is one of these needs no remainder entry.
const SETTLED = new Set(["pass", "inapplicable"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// An option given without a value parses as "true" or "", and neither names a
// file or a head.
function optionsFrom(argv) {
  const options = parseArgs(argv);
  if (options === null) {
    throw new UsageError("options must be --name=value flags");
  }
  const unknown = Object.keys(options).find((name) => !Object.hasOwn(OPTIONS, name));
  if (unknown) {
    throw new UsageError(`unknown option --${unknown}`);
  }
  for (const [name, placeholder] of Object.entries(OPTIONS)) {
    if (!options[name] || options[name] === "true") {
      throw new UsageError(`--${name}=<${placeholder}> is required`);
    }
  }
  return options;
}

function readEvidence(file) {
  let evidence;
  try {
    evidence = JSON.parse(readText(file, "evidence-file"));
  } catch (error) {
    if (error instanceof UsageError) {
      throw error;
    }
    throw new UsageError("--evidence-file is not valid JSON", { cause: error });
  }
  if (!(Array.isArray(evidence?.tasks) && isPlainObject(evidence?.rows))) {
    throw new UsageError("--evidence-file must hold tasks[] and rows{}");
  }
  return evidence;
}

const STATUSES = new Set(["pass", "unverified", "failed", "blocked", "inapplicable"]);
const ROW_FIELDS = new Set(["observed", "status", "reason"]);
const TASK_FIELDS = new Set(["id", "commit", "files", "result"]);

// ASSUMPTION: an entry that is not a JSON object counts as missing, since the
// plan names no error for it and reading its fields would throw.
function hasEntry(rows, id) {
  return Object.hasOwn(rows, id) && isPlainObject(rows[id]);
}

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

// One problem per field the evidence file may not carry or carries badly.
function rowProblems(id, entry) {
  const problems = Object.keys(entry)
    .filter((key) => !ROW_FIELDS.has(key))
    .map((key) => `row ${id} entry field ${key} comes from the plan, not the evidence file`);
  if (!isText(entry.observed)) {
    problems.push(`row ${id} entry needs a non-empty observed`);
  }
  if (!STATUSES.has(entry.status)) {
    problems.push(`row ${id} entry status must be one of ${[...STATUSES].join(", ")}`);
  }
  if (Object.hasOwn(entry, "reason") && !isText(entry.reason)) {
    problems.push(`row ${id} entry reason must be non-empty text`);
  }
  return problems;
}

function taskEntryProblems(entry) {
  const problems = Object.keys(entry)
    .filter((key) => !TASK_FIELDS.has(key))
    .map((key) => `task ${entry.id} entry field ${key} comes from the plan, not the evidence file`);
  if (!isText(entry.commit)) {
    problems.push(`task ${entry.id} entry needs a commit`);
  }
  if (!(Array.isArray(entry.files) && entry.files.length > 0 && entry.files.every(isText))) {
    problems.push(`task ${entry.id} entry needs a non-empty files list`);
  }
  if (!isText(entry.result)) {
    problems.push(`task ${entry.id} entry needs a result`);
  }
  return problems;
}

function taskProblems(planned, entries) {
  const plannedIds = new Set(planned.map((task) => task.id));
  const entryIds = entries.map((entry) => entry?.id);
  return [
    ...planned.filter((task) => !entryIds.includes(task.id)).map((task) => `task ${task.id} has no evidence entry`),
    ...entryIds.filter((id) => !plannedIds.has(id)).map((id) => `task entry ${id} matches no planned task`),
    ...entries.filter((entry) => isPlainObject(entry) && plannedIds.has(entry.id)).flatMap(taskEntryProblems),
  ];
}

// Keys come in the order post-push and the reader expect. The planned row owns
// every identity field, evidence id included; the entry owns what was observed.
function matrixRow(row, entry, headSha) {
  const out = {
    id: row.id,
    contract: row.contract,
    path: row.path,
    proof: row.proof,
    expected: row.expected,
    observed: entry.observed,
    status: entry.status,
    evidence: row.evidence,
    headSha,
  };
  if (Object.hasOwn(entry, "reason")) {
    out.reason = entry.reason;
  }
  return out;
}

function oneLine(text) {
  return String(text).replace(/\s+/g, " ");
}

// The bullet names the task's functional slice (or its parent-level marker) and its
// planned evidence ids, all from the task list, so the comment maps each task to its child.
function taskBullet(task, entry) {
  let owner = `parent-level ${task.parentLevel ?? "none"}`;
  if (task.child) {
    owner = `slice ${task.child}`;
  }
  const evidence = evidenceValues(task.evidence).join(", ");
  return `- ${task.id} (${owner}): commit ${entry.commit}, files ${entry.files.join(", ")}, evidence ${evidence}, result ${oneLine(entry.result)}`;
}

function commentText(bullets, rows) {
  const open = rows.filter((row) => !SETTLED.has(row.status)).map((row) => row.id);
  let remainder = open.join(", ");
  if (open.length === 0) {
    remainder = "none";
  }
  return (
    "## Implementation handoff\n\n" +
    `${bullets.join("\n")}\n` +
    "\n## Acceptance matrix\n\n```json\n" +
    `${JSON.stringify(rows, null, 2)}\n` +
    "```\n\n" +
    `Remainder: ${remainder}\n`
  );
}

function rowSetProblems(planned, rows) {
  const plannedIds = new Set(planned.map((row) => row.id));
  return [
    ...planned.filter((row) => !hasEntry(rows, row.id)).map((row) => `row ${row.id} has no evidence entry`),
    ...Object.keys(rows)
      .filter((key) => !plannedIds.has(key))
      .map((key) => `evidence entry ${key} matches no planned row`),
    ...planned.filter((row) => hasEntry(rows, row.id)).flatMap((row) => rowProblems(row.id, rows[row.id])),
  ];
}

// Returns { text } when every planned task and row has a well-formed entry and no
// entry is extra, else { errors } naming each mismatch, with nothing built.
function build({ body, evidence, headSha }) {
  const { input, errors } = parseIssueBodyRecords(body);
  if (errors.length > 0) {
    return { errors };
  }
  const planned = input.plannedAcceptanceMatrix;
  const problems = [...taskProblems(input.tasks, evidence.tasks), ...rowSetProblems(planned, evidence.rows)];
  if (problems.length > 0) {
    return { errors: problems };
  }
  const rows = planned.map((row) => matrixRow(row, evidence.rows[row.id], headSha));
  const entries = new Map(evidence.tasks.map((entry) => [entry.id, entry]));
  const bullets = input.tasks.map((task) => taskBullet(task, entries.get(task.id)));
  return { text: commentText(bullets, rows) };
}

function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let result;
  try {
    const options = optionsFrom(argv);
    const body = readText(options["body-file"], "body-file");
    const evidence = readEvidence(options["evidence-file"]);
    result = build({ body, evidence, headSha: options["head-sha"] });
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (result.errors) {
    stderr.write(result.errors.map((message) => `${message}\n`).join(""));
    return 1;
  }
  stdout.write(result.text);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };

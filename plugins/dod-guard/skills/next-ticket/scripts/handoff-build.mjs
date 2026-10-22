#!/usr/bin/env node
// Prints the next-ticket implementation handoff comment from an issue body's
// planned acceptance matrix and an evidence file, so the observed matrix JSON
// is encoded by JSON.stringify and never hand-written.
//
// Usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>
//
// The evidence file is JSON in this shape:
//   {
//     "tasks": [{ "id": "T1", "commit": "<sha>", "files": ["a.mjs"], "result": "text" }],
//     "rows": {
//       "R1": { "observed": "text", "status": "pass", "evidence": "text" },
//       "R2": { "observed": "text", "status": "inapplicable", "evidence": "text", "reason": "text" }
//     }
//   }
// Every planned row needs one rows entry, and no rows entry may name a row the
// body does not plan. stdout is the comment text, which post-push reads as the
// handoff file. stderr lists each problem, one per line, and nothing is printed
// on stdout then. Exit status: 0 built, 1 problems in the body or evidence,
// 2 usage error.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
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

// ASSUMPTION: a rows entry that is not a JSON object counts as missing, since
// the plan names no error for it and reading its fields would throw.
function hasEntry(rows, id) {
  return Object.hasOwn(rows, id) && isPlainObject(rows[id]);
}

// Keys come in the order post-push and the reader expect. The planned row's own
// evidence and status fields are not copied, so the entry's values are the only ones.
function matrixRow(row, entry, headSha) {
  const out = {
    id: row.id,
    contract: row.contract,
    path: row.path,
    proof: row.proof,
    expected: row.expected,
    observed: entry.observed,
    status: entry.status,
    evidence: entry.evidence,
    headSha,
  };
  if (Object.hasOwn(entry, "reason")) {
    out.reason = entry.reason;
  }
  return out;
}

function commentText(tasks, rows) {
  const bullets = tasks.map(
    (task) =>
      `- ${task.id}: commit ${task.commit}, files ${task.files.join(", ")}, result ${String(task.result).replace(/\s+/g, " ")}`,
  );
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

// Returns { text } when every planned row has an entry and no entry is extra,
// else { errors } naming each mismatch, with nothing built.
function build({ body, evidence, headSha }) {
  const { input, errors } = parseIssueBodyRecords(body);
  if (errors.length > 0) {
    return { errors };
  }
  const planned = input.plannedAcceptanceMatrix;
  const plannedIds = new Set(planned.map((row) => row.id));
  const problems = [
    ...planned.filter((row) => !hasEntry(evidence.rows, row.id)).map((row) => `row ${row.id} has no evidence entry`),
    ...Object.keys(evidence.rows)
      .filter((key) => !plannedIds.has(key))
      .map((key) => `evidence entry ${key} matches no planned row`),
  ];
  if (problems.length > 0) {
    return { errors: problems };
  }
  const rows = planned.map((row) => matrixRow(row, evidence.rows[row.id], headSha));
  return { text: commentText(evidence.tasks, rows) };
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

#!/usr/bin/env node
// Runs the structured-handoff convergence proof over an issue body.
//
// Usage: node handoff-proof.mjs refinement --body-file=<path> [--children=<path>]
//
// refinement reads the records of a body saved to a local file, plus the
// linked functional-slice children from an optional JSON array file, and runs
// the pre-push proof, including the lens-row rules on the planned acceptance
// matrix. It makes no network or GitHub call; fetching the issue belongs to
// the caller. It prints one JSON object {outcome, remainder} and exits:
//   0  verified
//   1  actionable remainder
//   2  usage or parse error
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { evaluateConvergence } from "./structured-workflow-proof.mjs";

const EXIT_CODES = Object.freeze({ verified: 0, "actionable remainder": 1 });
const OPTIONS = new Set(["body-file", "children"]);

class UsageError extends Error {}

// The proof itself, with no file access: parse errors stop before evaluation,
// and acceptance-id disagreements join the convergence remainder.
function refinementProof({ body, children = [] }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) return { outcome: "parse error", remainder: parsed.errors };
  const convergence = evaluateConvergence({ ...parsed.input, children });
  const remainder = [...parsed.remainder, ...convergence.remainder];
  return { outcome: remainder.length === 0 ? "verified" : "actionable remainder", remainder };
}

function optionsFrom(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "refinement") throw new UsageError("the first argument must be the refinement subcommand");
  const options = parseArgs(rest);
  if (options === null) {
    throw new UsageError(`unexpected argument ${rest.find((item) => !item.startsWith("--"))}`);
  }
  const unknown = Object.keys(options).find((name) => !OPTIONS.has(name));
  if (unknown) throw new UsageError(`unknown option --${unknown}`);
  if (!options["body-file"] || options["body-file"] === "true") {
    throw new UsageError("--body-file=<path> is required");
  }
  return options;
}

function readText(file, option) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`cannot read --${option} ${file}`);
  }
}

function readChildren(file) {
  if (file === undefined) return [];
  let children;
  try {
    children = JSON.parse(readText(file, "children"));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("--children file is not valid JSON");
  }
  if (!Array.isArray(children)) throw new UsageError("--children file must hold a JSON array");
  return children;
}

function main(argv) {
  let result;
  try {
    const options = optionsFrom(argv);
    const body = readText(options["body-file"], "body-file");
    result = refinementProof({ body, children: readChildren(options.children) });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    result = { outcome: "usage error", remainder: [error.message] };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return EXIT_CODES[result.outcome] ?? 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

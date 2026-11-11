#!/usr/bin/env node
// Collapses the workflow runs listed for one head into the rows of the `## Preflight checkpoint` record.
//
// Usage: node collapse-context-runs.mjs --runs-file=<runs.json>
//
// --runs-file holds a JSON array with one object per workflow run of each required context: context, provider,
// workflow, runId, event, ref, headSha, state. Runs of one workflow at one head from different events collapse
// to the pull_request run; stdout is the JSON array of rows, each without its event. Exit status: 0 rows written,
// 1 a context that cannot collapse (stderr names each, stdout stays empty), 2 usage error.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { collapseContextRuns } from "../../../lib/context-runs.mjs";
import { readText, UsageError } from "./handoff-proof-cli.mjs";

const USAGE = "usage: node collapse-context-runs.mjs --runs-file=<runs.json>\n";

function runsFileFrom(argv) {
  const options = parseArgs(argv);
  const file = options?.["runs-file"];
  if (options === null || Object.keys(options).length !== 1 || !file || file === "true") {
    throw new UsageError("--runs-file=<runs.json> is the only option and is required");
  }
  return file;
}

function readRuns(file) {
  let runs;
  try {
    runs = JSON.parse(readText(file, "runs-file"));
  } catch (error) {
    throw error instanceof UsageError ? error : new UsageError("--runs-file is not valid JSON", { cause: error });
  }
  if (!Array.isArray(runs)) {
    throw new UsageError("--runs-file must hold a JSON array");
  }
  return runs;
}

function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let result;
  try {
    result = collapseContextRuns(readRuns(runsFileFrom(argv)));
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (result.problems.length > 0) {
    stderr.write(result.problems.map((problem) => `${problem}\n`).join(""));
    return 1;
  }
  stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };

#!/usr/bin/env node
// Waits for the check runs of one commit by attempt count. An attempt count
// ends a call, never a CI run, so the helper imposes no deadline on CI itself.
import { execFile } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parseArguments, USAGE } from "./ci-wait-args.mjs";

const run = promisify(execFile);
const PASSING = new Set(["success", "skipped", "neutral"]);
export const EXIT = { passed: 0, failed: 1, pending: 2, usage: 3 };

const PENDING_NOTE =
  "PENDING: still running. Run the same command again to keep waiting; an exhausted attempt count is not a failure.";
const SUMMARY = {
  failed: (verdict) => `FAILED: ${verdict.failed.join(", ")}`,
  pending: () => PENDING_NOTE,
  passed: () => "PASSED",
};

// A re-run adds a check run with the same name; the highest id is the newest.
export function newestPerName(checkRuns) {
  const byName = new Map();
  for (const checkRun of checkRuns) {
    const held = byName.get(checkRun.name);
    if (!held || checkRun.id > held.id) byName.set(checkRun.name, checkRun);
  }
  return [...byName.values()];
}

const isFinished = (checkRun) => checkRun.status === "completed";
const isFailed = (checkRun) => isFinished(checkRun) && !PASSING.has(checkRun.conclusion);
const describe = (checkRun) => `${checkRun.name}: ${isFinished(checkRun) ? checkRun.conclusion : checkRun.status}`;

function stateOf(latest, missing) {
  if (latest.some(isFailed)) return "failed";
  const waiting = latest.length === 0 || missing.length > 0 || !latest.every(isFinished);
  return waiting ? "pending" : "passed";
}

export function judge(checkRuns, required = []) {
  const latest = newestPerName(checkRuns);
  const missing = required.filter((name) => !latest.some((c) => c.name === name));
  const lines = [...latest.map(describe), ...missing.map((name) => `${name}: not started`)];
  return { state: stateOf(latest, missing), lines, failed: latest.filter(isFailed).map((c) => c.name) };
}

export async function waitForChecks({ repository, sha, required, attempts, intervalSeconds, gh, sleep, print }) {
  let verdict = { state: "pending", lines: [], failed: [] };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const text = await gh(["api", `repos/${repository}/commits/${sha}/check-runs?per_page=100`]);
    verdict = judge(JSON.parse(text).check_runs, required);
    print(`attempt ${attempt} of ${attempts}`);
    for (const line of verdict.lines) print(`  ${line}`);
    if (verdict.state !== "pending") return verdict;
    if (attempt < attempts) await sleep(intervalSeconds * 1000);
  }
  return verdict;
}

export async function main(argv, io) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    io.print(`${USAGE}\n${error.message}`);
    return EXIT.usage;
  }
  let verdict;
  try {
    verdict = await waitForChecks({ ...options, ...io });
  } catch (error) {
    io.print(`read failed: ${error.message}`);
    return EXIT.usage;
  }
  io.print(SUMMARY[verdict.state](verdict));
  return EXIT[verdict.state];
}

const realIo = {
  gh: async (args) => (await run("gh", args, { maxBuffer: 16 * 1024 * 1024 })).stdout,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  print: (line) => console.log(line),
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main(process.argv.slice(2), realIo);
}

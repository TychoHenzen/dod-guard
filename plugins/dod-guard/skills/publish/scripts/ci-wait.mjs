#!/usr/bin/env node
// Waits for the check runs of one commit by attempt count. An attempt count
// ends a call, never a CI run, so the helper imposes no deadline on CI itself.
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const PASSING = new Set(["success", "skipped", "neutral"]);
export const EXIT = { passed: 0, failed: 1, pending: 2, usage: 3 };

// A re-run adds a check run with the same name; the highest id is the newest.
export function newestPerName(checkRuns) {
  const byName = new Map();
  for (const checkRun of checkRuns) {
    const held = byName.get(checkRun.name);
    if (!held || checkRun.id > held.id) byName.set(checkRun.name, checkRun);
  }
  return [...byName.values()];
}

export function judge(checkRuns, required = []) {
  const latest = newestPerName(checkRuns);
  const lines = latest.map((c) => `${c.name}: ${c.status === "completed" ? c.conclusion : c.status}`);
  const failed = latest.filter((c) => c.status === "completed" && !PASSING.has(c.conclusion)).map((c) => c.name);
  const missing = required.filter((name) => !latest.some((c) => c.name === name));
  for (const name of missing) lines.push(`${name}: not started`);
  if (failed.length > 0) return { state: "failed", lines, failed };
  const waiting = latest.some((c) => c.status !== "completed") || missing.length > 0 || latest.length === 0;
  return { state: waiting ? "pending" : "passed", lines, failed };
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

export function parseArguments(argv) {
  const options = { attempts: 5, intervalSeconds: 15, required: [] };
  for (const argument of argv) {
    const [key, value = ""] = argument.split(/=(.*)/s, 2);
    if (key === "--repository") options.repository = value;
    else if (key === "--sha") options.sha = value;
    else if (key === "--attempts") options.attempts = Number(value);
    else if (key === "--interval") options.intervalSeconds = Number(value);
    else if (key === "--require") options.required = value.split(",").filter(Boolean);
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository ?? "")) throw new Error("--repository=<owner/name> is required");
  if (!/^[0-9a-f]{40}$/.test(options.sha ?? "")) throw new Error("--sha=<40 hex characters> is required");
  if (!Number.isInteger(options.attempts) || options.attempts < 1)
    throw new Error("--attempts must be a positive integer");
  if (!(options.intervalSeconds >= 0)) throw new Error("--interval must be a number of seconds");
  return options;
}

export async function main(argv, io) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    io.print(
      `usage: node ci-wait.mjs --repository=<owner/name> --sha=<sha> [--require=a,b] [--attempts=5] [--interval=15]\n${error.message}`,
    );
    return EXIT.usage;
  }
  let verdict;
  try {
    verdict = await waitForChecks({ ...options, ...io });
  } catch (error) {
    io.print(`read failed: ${error.message}`);
    return EXIT.usage;
  }
  if (verdict.state === "failed") io.print(`FAILED: ${verdict.failed.join(", ")}`);
  if (verdict.state === "pending")
    io.print(
      "PENDING: still running. Run the same command again to keep waiting; an exhausted attempt count is not a failure.",
    );
  if (verdict.state === "passed") io.print("PASSED");
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

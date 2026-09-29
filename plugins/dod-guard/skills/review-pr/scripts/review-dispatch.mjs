// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { readFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { fileURLToPath } from "node:url";
import { resolveCodexExecutable } from "../../codex-advisor/scripts/codex-launch-contract.mjs";
import { runAdvisor } from "../../codex-advisor/scripts/run-advisor.mjs";
import { REVIEWERS } from "./lib/review-units.mjs";

const WINDOWS_REVIEWER_CONCURRENCY = 1;
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_REASONING_EFFORT = "medium";
const DEFAULT_SCHEMA_PATH = fileURLToPath(new URL("../response-schema.json", import.meta.url));
const WINDOWS_WRAPPER_PATTERN = /(?:powershell|pwsh|(?:^|[\\/])cmd(?:\.exe)?$|\.ps1(?:$|[?#]))/u;

function entryKey({ reviewer, unit }) {
  return `${reviewer}\u0000${unit}`;
}

// A retry reruns only the (reviewer, unit) pairs whose earlier execution did not
// complete, so a completed recommendation is never produced twice.
function incompleteEntries(reviewers, previous) {
  const completed = new Set(
    (previous?.reviews ?? []).filter(({ execution }) => execution?.status === "completed").map(entryKey),
  );
  return reviewers.filter((entry) => !completed.has(entryKey(entry)));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.length > 0;
}

function requireEntry(entry) {
  if (!REVIEWERS.includes(entry?.reviewer)) {
    throw new Error(`Reviewer dispatch received an unknown reviewer: ${entry?.reviewer ?? ""}`);
  }
  if (!nonEmptyText(entry.unit)) {
    throw new TypeError("Reviewer dispatch requires a review unit for every reviewer.");
  }
  if (!nonEmptyText(entry.prompt)) {
    throw new TypeError("Reviewer dispatch requires a non-empty prompt for every reviewer.");
  }
}

function requireReviewers(reviewers) {
  if (!Array.isArray(reviewers) || reviewers.length === 0) {
    throw new TypeError("Reviewer dispatch requires at least one reviewer.");
  }
  reviewers.forEach(requireEntry);
  const pairs = reviewers.map(entryKey);
  if (new Set(pairs).size !== pairs.length) {
    throw new Error("Reviewer dispatch cannot start the same reviewer twice for one unit.");
  }
}

function rejectWindowsWrappers({ executable, prefixArgs, platform }) {
  if (platform !== "win32") {
    return;
  }
  const values = [executable, ...prefixArgs].map((value) => String(value).toLowerCase());
  const wrapper = values.find((value) => WINDOWS_WRAPPER_PATTERN.test(value));
  if (wrapper) {
    throw new Error(`Windows reviewer dispatch rejects shell wrapper: ${wrapper}`);
  }
}

function parseReviewerResponse(raw) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    return { error: "Reviewer output is not valid JSON" };
  }
  if (!response || Array.isArray(response) || typeof response !== "object") {
    return { error: "Reviewer output is not a JSON object" };
  }
  return { value: response };
}

function reviewRecord({ reviewer, unit }, result) {
  let payload = null;
  let error = null;
  if (result.ok) {
    payload = {
      reviewer: result.reviewer,
      coverage: result.coverage,
      findings: result.findings,
    };
  } else {
    ({ error } = result);
  }
  return {
    reviewer,
    unit,
    result: payload,
    error,
    capability: result.capability ?? null,
    execution: result.execution,
  };
}

async function dispatchReviewers({
  reviewers,
  executable = resolveCodexExecutable(),
  prefixArgs = [],
  model = DEFAULT_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  schemaPath = DEFAULT_SCHEMA_PATH,
  tempRoot = tmpdir(),
  env = {},
  signal,
  platform = process.platform,
  spawnImpl,
} = {}) {
  requireReviewers(reviewers);
  rejectWindowsWrappers({ executable, prefixArgs, platform });
  const results = [];
  for (const entry of reviewers) {
    // biome-ignore lint/performance/noAwaitInLoops: Windows reviewers must start one at a time (WINDOWS_REVIEWER_CONCURRENCY).
    const result = await runAdvisor({
      prompt: entry.prompt,
      executable,
      prefixArgs,
      model,
      reasoningEffort,
      schemaPath,
      tempRoot,
      env,
      signal,
      parseResponse: parseReviewerResponse,
      spawnImpl,
    });
    results.push(reviewRecord(entry, result));
  }
  return {
    terminal: results.every(({ execution }) => execution?.status === "completed"),
    maxConcurrency: WINDOWS_REVIEWER_CONCURRENCY,
    reviews: results,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return;
  }
  return process.argv[index + 1];
}

async function main() {
  const inputPath = argumentValue("--input");
  if (!inputPath) {
    throw new Error("Reviewer dispatch requires --input <path>.");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const previousPath = argumentValue("--retry-incomplete");
  if (previousPath) {
    input.reviewers = incompleteEntries(input.reviewers, JSON.parse(await readFile(previousPath, "utf8")));
  }
  process.stdout.write(`${JSON.stringify(await dispatchReviewers(input), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`review-dispatch failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { WINDOWS_REVIEWER_CONCURRENCY, dispatchReviewers, incompleteEntries };

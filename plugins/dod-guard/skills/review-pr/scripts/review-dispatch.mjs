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

const REVIEWERS = Object.freeze([
  "review-pr-feature",
  "review-pr-design",
  "review-pr-reliability",
  "review-pr-hygiene",
]);
const WINDOWS_REVIEWER_CONCURRENCY = 1;
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_REASONING_EFFORT = "max";
const DEFAULT_SCHEMA_PATH = fileURLToPath(new URL("../response-schema.json", import.meta.url));
const WINDOWS_WRAPPER_PATTERN = /(?:powershell|pwsh|(?:^|[\\/])cmd(?:\.exe)?$|\.ps1(?:$|[?#]))/u;

function requireReviewers(reviewers) {
  if (!Array.isArray(reviewers) || reviewers.length === 0) {
    throw new TypeError("Reviewer dispatch requires at least one reviewer.");
  }
  const names = reviewers.map((entry) => entry?.reviewer);
  if (names.some((name) => !REVIEWERS.includes(name))) {
    throw new Error(`Reviewer dispatch received an unknown reviewer: ${names.find((name) => !REVIEWERS.includes(name)) ?? ""}`);
  }
  if (new Set(names).size !== names.length) {
    throw new Error("Reviewer dispatch cannot start the same reviewer twice.");
  }
  if (reviewers.some((entry) => typeof entry.prompt !== "string" || entry.prompt.length === 0)) {
    throw new TypeError("Reviewer dispatch requires a non-empty prompt for every reviewer.");
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

function reviewRecord(reviewer, result) {
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
    result: payload,
    error,
    capability: result.capability ?? null,
    execution: result.execution,
  };
}

export async function dispatchReviewers({
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
    results.push(reviewRecord(entry.reviewer, result));
  }
  return {
    terminal: results.every(({ execution }) => execution?.status === "completed"),
    maxConcurrency: WINDOWS_REVIEWER_CONCURRENCY,
    reviews: results,
  };
}

export { REVIEWERS, WINDOWS_REVIEWER_CONCURRENCY };

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const inputPath = argumentValue("--input");
  if (!inputPath) {
    throw new Error("Reviewer dispatch requires --input <path>.");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  process.stdout.write(`${JSON.stringify(await dispatchReviewers(input), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`review-dispatch failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

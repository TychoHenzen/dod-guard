import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { jsonEvents, modelMetadataFallback, oneTurnViolation } from "./advisor-events.mjs";
import { executionEvidence, failure, processEvidence, stageFailure } from "./advisor-evidence.mjs";
import { childEnv, MAX_OUTPUT_BYTES, runProcess } from "./advisor-process.mjs";
import { parseAdvice, readAdvice } from "./advisor-report.mjs";
import { buildCodexExecArgs, buildCodexPreflightArgs, resolveCodexExecutable } from "./codex-launch-contract.mjs";

const defaultSchemaPath = fileURLToPath(new URL("../response-schema.json", import.meta.url));

function attemptedExecArgs({ mode = "read-only", prefixArgs, model, reasoningEffort }) {
  const attemptedPrefix = Array.isArray(prefixArgs) ? prefixArgs : [];
  const args = [...attemptedPrefix, "exec"];
  if (mode === "write") args.push("--approve-for-me");
  if (model !== undefined) args.push("--model", model);
  args.push("-c", `model_reasoning_effort=${reasoningEffort}`);
  if (mode === "read-only") {
    args.push("-s", "read-only", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--ephemeral");
  }
  args.push("--json");
  return args;
}

function optionError(name, value) {
  if (typeof value !== "string" || !value || /[\s"&|<>^()%!]/u.test(value)) {
    return `Codex advisor ${name} contains unsupported shell characters`;
  }
}

function invalidOptionMessage({ prefixArgs, model, reasoningEffort }) {
  const options = [
    ["model", model],
    ["reasoning effort", reasoningEffort],
    ...(Array.isArray(prefixArgs) ? prefixArgs.map((value, index) => [`prefix argument ${index + 1}`, value]) : []),
  ];
  const invalid = options.find(([name, value]) => value !== undefined && optionError(name, value));
  return invalid ? optionError(...invalid) : undefined;
}

const UNAVAILABLE_MESSAGE =
  "Codex advisor installation is unavailable: no existing Codex executable was found on the Windows PATH " +
  "or behind a codex.cmd shim";

// The arguments are built before any validation so a throw from them escapes runAdvisor, as it always has.
function describeAttempt(options) {
  return { ...options, attemptedArgs: attemptedExecArgs({ mode: "read-only", ...options }) };
}

function launcherRejection(attempt) {
  const message = attempt.executable ? invalidOptionMessage(attempt) : UNAVAILABLE_MESSAGE;
  if (!message) return;
  const { executable, attemptedArgs, prefixArgs } = attempt;
  const launch = { executable, args: attemptedArgs, stage: "launcher-contract", prefixArgs };
  return failure(message, undefined, launch);
}

function launcherCrash(attempt, error) {
  const { executable, attemptedArgs, prefixArgs } = attempt;
  const message = `Codex advisor could not start: ${error.message}`;
  const launch = { executable, args: attemptedArgs, stage: "launcher-contract", prefixArgs };
  return failure(message, undefined, launch);
}

function preflightMessage(stage, result) {
  if (result.outputLimitExceeded) return `Codex advisor ${stage} capability probe exceeded ${MAX_OUTPUT_BYTES} bytes`;
  if (result.startError) return `Codex advisor executable is missing or cannot start (${result.startError.message})`;
  if (result.cancelled) return "Codex advisor capability probe cancelled by operator";
  if (result.code !== 0) return `Codex advisor ${stage} capability probe exits non-zero with code ${result.code}`;
}

async function runPreflight({ executable, prefixArgs, workdir, env, signal, spawnImpl }) {
  const preflightArgs = buildCodexPreflightArgs({ mode: "read-only", prefixArgs });
  const launcher = { executable, prefixArgs };
  const probes = {};
  for (const [stage, args] of Object.entries(preflightArgs)) {
    const spec = { executable, args, cwd: workdir, env: childEnv(env), prompt: "", signal, spawnImpl };
    const result = await runProcess(spec);
    const message = preflightMessage(stage, result);
    if (message) return { failure: stageFailure({ launcher, args, result }, stage, message) };
    probes[stage] = processEvidence({ executable, args }, result);
  }
  return { probes };
}

function launchFailure(step) {
  const { result } = step;
  if (result.outputLimitExceeded) {
    return stageFailure(step, "reviewer-process", `Codex advisor output exceeded ${MAX_OUTPUT_BYTES} bytes`);
  }
  if (result.startError) {
    const message = `Codex advisor executable is missing or cannot start (${result.startError.message})`;
    return stageFailure(step, "reviewer-launch", message);
  }
  if (result.stdinError) {
    const message = `Codex advisor prompt could not be written (${result.stdinError.message})`;
    return stageFailure(step, "reviewer-launch", message);
  }
  if (result.cancelled) return stageFailure(step, "reviewer-process", "Codex advisor cancelled by operator");
}

function outcomeFailure(step, model) {
  const { result } = step;
  const events = jsonEvents(result.stdout, result.stderr);
  const fallback = modelMetadataFallback(events, model);
  if (fallback) {
    const failed = stageFailure(step, "reviewer-process", fallback.message);
    failed.execution.fallbackEvent = fallback.event;
    return failed;
  }
  if (result.code !== 0) {
    return stageFailure(step, "reviewer-process", `Codex advisor exits non-zero with code ${result.code}`);
  }
  const violation = oneTurnViolation(events);
  return violation ? stageFailure(step, "reviewer-process", violation) : undefined;
}

async function launchReviewer(run) {
  const { executable, prefixArgs, model, reasoningEffort, schemaPath, workdir, env, prompt, signal, spawnImpl } = run;
  const outputPath = join(workdir, "last-message.json");
  const args = buildCodexExecArgs({
    mode: "read-only",
    prefixArgs,
    model,
    reasoningEffort,
    schemaPath,
    outputPath,
    workdir,
  });
  const result = await runProcess({ executable, args, cwd: workdir, env: childEnv(env), prompt, signal, spawnImpl });
  return { launcher: { executable, prefixArgs }, args, result, outputPath };
}

function adviceSuccess(step, preflight, advice) {
  const { executable, prefixArgs } = step.launcher;
  const launch = { executable, args: step.args, stage: "reviewer-process", prefixArgs };
  return {
    ok: true,
    ...(advice.value ?? {}),
    capability: { executable, probes: preflight.probes },
    execution: executionEvidence(launch, step.result, "completed"),
  };
}

async function runExec(run) {
  const step = await launchReviewer(run);
  const failed = launchFailure(step) ?? outcomeFailure(step, run.model);
  if (failed) return { failure: failed };
  return { ...(await readAdvice(step, run.parseResponse)), step };
}

async function runReviewer(run) {
  const preflight = await runPreflight(run);
  if (preflight.failure) return preflight.failure;
  const exec = await runExec(run);
  return exec.failure ?? adviceSuccess(exec.step, preflight, exec);
}

function removeWorkdir(workdir) {
  return workdir ? rm(workdir, { recursive: true, force: true }).catch(() => {}) : undefined;
}

export async function runAdvisor({
  prompt,
  executable,
  prefixArgs = [],
  model = "gpt-5.6-sol",
  reasoningEffort = "max",
  schemaPath = defaultSchemaPath,
  tempRoot = tmpdir(),
  signal,
  env = {},
  platform = process.platform,
  parseResponse = parseAdvice,
  spawnImpl = spawn,
}) {
  executable = executable ?? resolveCodexExecutable(platform, { ...process.env, ...env });
  const attempt = describeAttempt({ executable, prefixArgs, model, reasoningEffort });
  const rejected = launcherRejection(attempt);
  if (rejected) return rejected;
  let workdir;
  try {
    workdir = await mkdtemp(join(tempRoot, "dod-guard-codex-advisor-"));
    return await runReviewer({ ...attempt, schemaPath, signal, env, parseResponse, spawnImpl, prompt, workdir });
  } catch (error) {
    return launcherCrash(attempt, error);
  } finally {
    await removeWorkdir(workdir);
  }
}

function optionValue(name, fallback) {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (argument) return argument.slice(prefix.length);
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith("-") ? value : fallback;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const prefixArgs = process.env.CODEX_ADVISOR_PREFIX_ARGS ? JSON.parse(process.env.CODEX_ADVISOR_PREFIX_ARGS) : [];
  const result = await runAdvisor({
    prefixArgs,
    prompt: await readStdin(),
    model: optionValue("--model", "gpt-5.6-sol"),
    reasoningEffort: optionValue("--reasoning-effort", "max"),
  });
  if (result.execution) {
    process.stderr.write(`codex-advisor-execution ${JSON.stringify(result.execution)}\n`);
  }
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${result.advice}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

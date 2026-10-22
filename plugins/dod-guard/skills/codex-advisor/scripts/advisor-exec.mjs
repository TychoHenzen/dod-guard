import { join } from "node:path";
import { jsonEvents, modelMetadataFallback, oneTurnViolation } from "./advisor-events.mjs";
import { executionEvidence, stageFailure } from "./advisor-evidence.mjs";
import { runPreflight } from "./advisor-preflight.mjs";
import { childEnv, MAX_OUTPUT_BYTES, runProcess } from "./advisor-process.mjs";
import { readAdvice } from "./advisor-report.mjs";
import { buildCodexExecArgs } from "./codex-launch-contract.mjs";

async function launchReviewer(run) {
  const { executable, prefixArgs, model, reasoningEffort, schemaPath, workdir, env, prompt, signal, spawnImpl } = run;
  const outputPath = join(workdir, "last-message.json");
  const mode = "read-only";
  const args = buildCodexExecArgs({ mode, prefixArgs, model, reasoningEffort, schemaPath, outputPath, workdir });
  const result = await runProcess({ executable, args, cwd: workdir, env: childEnv(env), prompt, signal, spawnImpl });
  return { launcher: { executable, prefixArgs }, args, result, outputPath };
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

// Runs the advisor turn and reads its report. Resolves with `{ failure }` or the parsed advice and its step.
async function runExec(run) {
  const step = await launchReviewer(run);
  const failed = launchFailure(step) ?? outcomeFailure(step, run.model);
  if (failed) return { failure: failed };
  return { ...(await readAdvice(step, run.parseResponse)), step };
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

// Runs the capability probes, then the advisor turn, and resolves with the success record or the first failure.
export async function runReviewer(run) {
  const preflight = await runPreflight(run);
  if (preflight.failure) return preflight.failure;
  const exec = await runExec(run);
  return exec.failure ?? adviceSuccess(exec.step, preflight, exec);
}

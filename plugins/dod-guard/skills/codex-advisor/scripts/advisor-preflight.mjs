import { processEvidence, stageFailure } from "./advisor-evidence.mjs";
import { childEnv, MAX_OUTPUT_BYTES, runProcess } from "./advisor-process.mjs";
import { buildCodexPreflightArgs } from "./codex-launch-contract.mjs";

function preflightMessage(stage, result) {
  if (result.outputLimitExceeded) return `Codex advisor ${stage} capability probe exceeded ${MAX_OUTPUT_BYTES} bytes`;
  if (result.startError) return `Codex advisor executable is missing or cannot start (${result.startError.message})`;
  if (result.cancelled) return "Codex advisor capability probe cancelled by operator";
  if (result.code !== 0) return `Codex advisor ${stage} capability probe exits non-zero with code ${result.code}`;
}

// Runs each capability probe in order and stops at the first one that fails.
export async function runPreflight({ executable, prefixArgs, workdir, env, signal, spawnImpl }) {
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

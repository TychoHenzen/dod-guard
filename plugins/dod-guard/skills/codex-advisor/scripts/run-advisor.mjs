import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describeAttempt, launcherCrash, launcherRejection } from "./advisor-attempt.mjs";
import { runReviewer } from "./advisor-exec.mjs";
import { parseAdvice } from "./advisor-report.mjs";
import { resolveCodexExecutable } from "./codex-launch-contract.mjs";

const defaultSchemaPath = fileURLToPath(new URL("../response-schema.json", import.meta.url));

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

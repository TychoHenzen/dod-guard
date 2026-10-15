import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodexExecArgs, buildCodexPreflightArgs, resolveCodexExecutable } from "./codex-launch-contract.mjs";

const defaultSchemaPath = fileURLToPath(new URL("../response-schema.json", import.meta.url));
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function cancelProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function runProcess(executable, args, options, prompt, abortSignal, spawnImpl = spawn) {
  return new Promise((resolveResult) => {
    let startError;
    let stdout = "";
    let stderr = "";
    let outputLimitExceeded = false;
    let cancelled = false;
    let stdinError;
    let child;
    try {
      child = spawnImpl(executable, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      resolveResult({
        code: null,
        signal: null,
        startError: error,
        stdinError: null,
        stderr: "",
        stdout: "",
        outputLimitExceeded: false,
        cancelled: false,
      });
      return;
    }
    const cancel = () => {
      cancelled = true;
      cancelProcessTree(child);
    };
    const appendOutput = (current, chunk) => {
      const next = current + chunk;
      if (Buffer.byteLength(next, "utf8") > MAX_OUTPUT_BYTES) {
        outputLimitExceeded = true;
        cancelProcessTree(child);
        return current;
      }
      return next;
    };
    if (abortSignal?.aborted) cancel();
    else abortSignal?.addEventListener("abort", cancel, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });
    child.once("error", (error) => {
      startError = error;
    });
    child.stdin.once("error", (error) => {
      if (cancelled && (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED")) return;
      stdinError = error;
    });
    child.once("close", (code, exitSignal) => {
      abortSignal?.removeEventListener("abort", cancel);
      resolveResult({
        code,
        signal: exitSignal,
        startError,
        stdinError,
        stderr,
        stdout,
        outputLimitExceeded,
        cancelled,
      });
    });
    child.stdin.end(prompt);
  });
}

function processEvidence(executable, args, processResult) {
  return {
    command: [executable, ...args],
    shell: false,
    exitCode: processResult?.code ?? null,
    signal: processResult?.signal ?? null,
    stderr: processResult?.stderr ?? "",
    stdout: processResult?.stdout ?? "",
    startError: processResult?.startError?.message ?? null,
    stdinError: processResult?.stdinError?.message ?? null,
  };
}

function executionEvidence(executable, args, processResult, stage, prefixArgs = []) {
  return {
    status: "incomplete",
    stage,
    prefixArgs,
    ...processEvidence(executable, args, processResult),
  };
}

function completedExecutionEvidence(executable, args, processResult, prefixArgs) {
  return {
    status: "completed",
    stage: "reviewer-process",
    prefixArgs,
    ...processEvidence(executable, args, processResult),
  };
}

function failure(message, processResult, executable, args, stage, prefixArgs = []) {
  const details = processResult?.stderr?.trim();
  return {
    ok: false,
    error: details ? `${message}: ${details}` : message,
    stderr: processResult?.stderr ?? "",
    stdout: processResult?.stdout ?? "",
    execution:
      executable && args && stage ? executionEvidence(executable, args, processResult, stage, prefixArgs) : undefined,
  };
}

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
  return undefined;
}

function parseAdvice(raw) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    return { error: "Codex advisor output is not valid JSON" };
  }
  if (!response || Array.isArray(response) || typeof response !== "object") {
    return { error: "Codex advisor output is not a JSON object" };
  }
  if (Object.keys(response).some((key) => key !== "advice")) {
    return { error: "Codex advisor output contains unsupported fields" };
  }
  if (typeof response.advice !== "string" || !/\S/.test(response.advice)) {
    return { error: "Codex advisor output does not contain non-whitespace advice" };
  }
  return { value: { advice: response.advice.trim() } };
}

function jsonEvents(...outputs) {
  const events = [];
  for (const output of outputs) {
    for (const line of output.split(/\r?\n/u)) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Banners and hook diagnostics share these streams; they are not events.
      }
    }
  }
  return events;
}

function modelMetadataFallback(events, model) {
  if (typeof model !== "string") return undefined;
  const prefix = `Model metadata for ${model} not found.`;
  for (const event of events) {
    const message = event?.item?.message;
    if (
      event?.type === "item.completed" &&
      event.item?.type === "error" &&
      typeof message === "string" &&
      message.startsWith(prefix) &&
      message.includes("Defaulting to fallback metadata")
    ) {
      return { event, message };
    }
  }
  return undefined;
}

// The Codex advisor must behave like Claude's built-in advisor tool: one turn,
// one answer, and no tool use. Reasoning and diagnostic error items are not
// tool use; any other item type, known or not, fails the run.
const ADVICE_ITEM_TYPES = new Set(["agent_message", "reasoning", "error"]);

function oneTurnViolation(events) {
  const turns = events.filter((event) => event?.type === "turn.started").length;
  if (turns !== 1) {
    return `Codex advisor ran ${turns} turns; exactly one is allowed`;
  }
  const tool = events.find(
    (event) =>
      typeof event?.type === "string" && event.type.startsWith("item.") && !ADVICE_ITEM_TYPES.has(event.item?.type),
  );
  if (tool) {
    return `Codex advisor used a tool (${tool.item?.type ?? "unknown item"}); its advice is not used`;
  }
  const answers = events.filter(
    (event) => event?.type === "item.completed" && event.item?.type === "agent_message",
  ).length;
  if (answers !== 1) {
    return `Codex advisor returned ${answers} agent messages; exactly one is allowed`;
  }
  return undefined;
}

// A step is one process invocation: the run it belongs to, its arguments, and its result.
function stageFailure(step, stage, message) {
  return failure(message, step.result, step.run.executable, step.args, stage, step.run.prefixArgs);
}

function processOptions(run) {
  return { cwd: run.workdir, env: { ...process.env, ...run.env } };
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
  if (!message) return undefined;
  const { executable, attemptedArgs, prefixArgs } = attempt;
  return failure(message, undefined, executable, attemptedArgs, "launcher-contract", prefixArgs);
}

function launcherCrash(attempt, error) {
  const { executable, attemptedArgs, prefixArgs } = attempt;
  const message = `Codex advisor could not start: ${error.message}`;
  return failure(message, undefined, executable, attemptedArgs, "launcher-contract", prefixArgs);
}

function preflightMessage(stage, result) {
  if (result.outputLimitExceeded) return `Codex advisor ${stage} capability probe exceeded ${MAX_OUTPUT_BYTES} bytes`;
  if (result.startError) return `Codex advisor executable is missing or cannot start (${result.startError.message})`;
  if (result.cancelled) return "Codex advisor capability probe cancelled by operator";
  if (result.code !== 0) return `Codex advisor ${stage} capability probe exits non-zero with code ${result.code}`;
  return undefined;
}

async function runPreflight(run) {
  const preflightArgs = buildCodexPreflightArgs({ mode: "read-only", prefixArgs: run.prefixArgs });
  const probes = {};
  for (const [stage, args] of Object.entries(preflightArgs)) {
    const result = await runProcess(run.executable, args, processOptions(run), "", run.signal, run.spawnImpl);
    const message = preflightMessage(stage, result);
    if (message) return { failure: stageFailure({ run, args, result }, stage, message) };
    probes[stage] = processEvidence(run.executable, args, result);
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
  return undefined;
}

function outcomeFailure(step) {
  const { result } = step;
  const events = jsonEvents(result.stdout, result.stderr);
  const fallback = modelMetadataFallback(events, step.run.model);
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

async function readReport(outputPath) {
  try {
    const raw = await readFile(outputPath, "utf8");
    return raw.trim() ? { raw } : { error: "Codex advisor output file is empty" };
  } catch {
    return { error: "Codex advisor output file is missing or unreadable" };
  }
}

function parseReport(raw, parseResponse) {
  try {
    return { parsed: parseResponse(raw) };
  } catch (error) {
    return { error: `Codex advisor output could not be parsed (${error.message})` };
  }
}

// A parser that returns nothing makes `parse.parsed.error` throw, which the outer catch reports as before.
async function readAdvice(step) {
  const report = await readReport(step.outputPath);
  const parse = report.error ? report : parseReport(report.raw, step.run.parseResponse);
  const error = parse.error ?? parse.parsed.error;
  if (error) return { failure: stageFailure(step, "reviewer-report", error) };
  return { value: parse.parsed.value };
}

async function launchReviewer(run) {
  const outputPath = join(run.workdir, "last-message.json");
  const args = buildCodexExecArgs({
    mode: "read-only",
    prefixArgs: run.prefixArgs,
    model: run.model,
    reasoningEffort: run.reasoningEffort,
    schemaPath: run.schemaPath,
    outputPath,
    workdir: run.workdir,
  });
  const result = await runProcess(run.executable, args, processOptions(run), run.prompt, run.signal, run.spawnImpl);
  return { run, args, result, outputPath };
}

function adviceSuccess(step, preflight, advice) {
  const { executable, prefixArgs } = step.run;
  return {
    ok: true,
    ...(advice.value ?? {}),
    capability: { executable, probes: preflight.probes },
    execution: completedExecutionEvidence(executable, step.args, step.result, prefixArgs),
  };
}

async function runExec(run) {
  const step = await launchReviewer(run);
  const failed = launchFailure(step) ?? outcomeFailure(step);
  if (failed) return { failure: failed };
  return { ...(await readAdvice(step)), step };
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

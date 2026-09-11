import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultSchemaPath = fileURLToPath(new URL("../response-schema.json", import.meta.url));

function killProcessTree(child) {
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

function runProcess(executable, args, options, prompt, timeoutMs) {
  return new Promise((resolveResult) => {
    let timedOut = false;
    let startError;
    let stdout = "";
    let stderr = "";
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      startError = error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({ code, signal, startError, stderr, stdout, timedOut });
    });
    child.stdin.end(prompt);
  });
}

function failure(message, processResult) {
  const details = processResult?.stderr?.trim();
  return {
    ok: false,
    error: details ? `${message}: ${details}` : message,
    stderr: processResult?.stderr ?? "",
    stdout: processResult?.stdout ?? "",
  };
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
  return { advice: response.advice.trim() };
}

export async function runAdvisor({
  prompt,
  executable = process.platform === "win32" ? "codex.cmd" : "codex",
  prefixArgs = [],
  model,
  reasoningEffort = "low",
  schemaPath = defaultSchemaPath,
  tempRoot = tmpdir(),
  timeoutMs = 60_000,
  env = {},
}) {
  let workdir;
  try {
    workdir = await mkdtemp(join(tempRoot, "dod-guard-codex-advisor-"));
    const outputPath = join(workdir, "last-message.json");
    const args = [
      ...prefixArgs,
      "exec",
      ...(model === undefined ? [] : ["--model", model]),
      "-c",
      `model_reasoning_effort=${reasoningEffort}`,
      "-s",
      "read-only",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--ephemeral",
      "-C",
      workdir,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-",
    ];
    const result = await runProcess(
      executable,
      args,
      { cwd: workdir, env: { ...process.env, ...env } },
      prompt,
      timeoutMs,
    );
    if (result.timedOut) {
      return failure(`Codex advisor timed out after ${timeoutMs} ms`, result);
    }
    if (result.startError) {
      return failure(`Codex advisor executable is missing or cannot start (${result.startError.message})`, result);
    }
    if (result.code !== 0) {
      return failure(`Codex advisor exits non-zero with code ${result.code}`, result);
    }

    let raw;
    try {
      raw = await readFile(outputPath, "utf8");
    } catch {
      return failure("Codex advisor output file is missing or unreadable", result);
    }
    if (!raw.trim()) {
      return failure("Codex advisor output file is empty", result);
    }
    const parsed = parseAdvice(raw);
    return parsed.error ? failure(parsed.error, result) : { ok: true, advice: parsed.advice };
  } catch (error) {
    return failure(`Codex advisor could not start: ${error.message}`, { stderr: "", stdout: "" });
  } finally {
    if (workdir) await rm(workdir, { recursive: true, force: true }).catch(() => {});
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
  const prefixArgs = process.env.CODEX_ADVISOR_PREFIX_ARGS
    ? JSON.parse(process.env.CODEX_ADVISOR_PREFIX_ARGS)
    : [];
  const result = await runAdvisor({
    prefixArgs,
    prompt: await readStdin(),
    model: optionValue("--model"),
    reasoningEffort: optionValue("--reasoning-effort", "low"),
    timeoutMs: Number(optionValue("--timeout-ms", "60000")),
  });
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

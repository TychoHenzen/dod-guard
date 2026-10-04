import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";
import { linterResult, linterUnavailable } from "./project-linter-support.mjs";
function run(spawn, args, cwd) {
  return spawn("cargo", args, {
    cwd,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    shell: false,
  });
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizedPath(repoRoot, candidate) {
  return resolve(repoRoot, candidate).replace(/\\/g, "/");
}

function primarySpan(message) {
  return (message.spans || []).find((span) => span.is_primary) || null;
}

function isCompilerError(parsed) {
  return (
    parsed?.reason === "compiler-message" && parsed.message?.level === "error"
  );
}

function errorDiagnostic(line) {
  const parsed = parseJson(line);
  if (!isCompilerError(parsed)) return null;
  const { message } = parsed;
  const span = primarySpan(message);
  if (!span || !span.file_name) return null;
  return { message, span };
}

function diagnosticAt(line, target, repoRoot) {
  const diagnostic = errorDiagnostic(line);
  if (!diagnostic) return null;
  const { message, span } = diagnostic;
  if (normalizedPath(repoRoot, span.file_name) !== target) return null;
  return {
    line: span.line_start,
    rule: message.code?.code || "clippy",
    message: message.message,
  };
}

function clippyFindings(stdout, filePath, repoRoot) {
  const target = normalizedPath(repoRoot, filePath);
  return stdout.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const finding = diagnosticAt(trimmed, target, repoRoot);
    return finding ? [finding] : [];
  });
}

function formatRustResult(result, findings) {
  if (result.error)
    return linterUnavailable(`cargo clippy failed: ${result.error.message}`);
  const stdout = result.stdout || "";
  const hasJson = stdout.split("\n").some((line) => {
    try {
      JSON.parse(line.trim());
      return true;
    } catch {
      return false;
    }
  });
  if (!hasJson)
    return linterUnavailable("cargo clippy returned malformed JSON output.");
  return linterResult(findings(stdout));
}

export function rustFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!existsSync(join(repoRoot, "Cargo.toml"))) return linterResult();
  try {
    return formatRustResult(
      run(spawn, ["clippy", "--message-format=json", "--no-deps"], repoRoot),
      (stdout) => clippyFindings(stdout, filePath, repoRoot),
    );
  } catch (error) {
    return linterUnavailable(
      `cargo clippy failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

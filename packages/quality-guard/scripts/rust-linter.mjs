/** Run fail-open Clippy checks for one Rust file. */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";
function run(spawn, args, cwd) {
  const result = spawn("cargo", args, {
    cwd,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    shell: false,
  });
  return result.stdout || "";
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A path, resolved against the crate root, with backslashes normalised. */
function normalizedPath(repoRoot, candidate) {
  return resolve(repoRoot, candidate).replace(/\\/g, "/");
}

/** The span clippy marks as primary, or null when the diagnostic has none. */
function primarySpan(message) {
  return (message.spans || []).find((span) => span.is_primary) || null;
}

function isCompilerError(parsed) {
  return (
    parsed?.reason === "compiler-message" && parsed.message?.level === "error"
  );
}

/**
 * One clippy diagnostic from one line of `--message-format=json` output, or
 * null when the line is not an error-level diagnostic on the target file.
 * Most lines in the stream are build artefacts, not diagnostics, and clippy
 * also reports warnings and notes on the same stream.
 */
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

/** Error-level clippy diagnostics whose primary span names the edited file. */
function clippyFindings(stdout, filePath, repoRoot) {
  const target = normalizedPath(repoRoot, filePath);
  return stdout.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const finding = diagnosticAt(trimmed, target, repoRoot);
    return finding ? [finding] : [];
  });
}

/**
 * Clippy, only when the repository is a cargo crate. Fails open: a timeout,
 * a missing cargo binary, or unparsable output all read the same as clippy
 * finding nothing.
 */
export function rustFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!existsSync(join(repoRoot, "Cargo.toml"))) return [];
  try {
    const stdout = run(
      spawn,
      ["clippy", "--message-format=json", "--no-deps"],
      repoRoot,
    );
    return clippyFindings(stdout, filePath, repoRoot);
  } catch {
    return [];
  }
}

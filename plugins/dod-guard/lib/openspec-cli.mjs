// Runs the OpenSpec CLI against a change held in memory. The change is written
// into a fresh OpenSpec root under the system temp directory, validated there,
// and the root is removed, so no checkout gains an `openspec/` side effect.
// The format check and the publish step share this runner, so OpenSpec stays
// the one judge of the change format.
// biome-ignore lint/correctness/noNodejsModules: OpenSpec is a separate command-line tool
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the change is written to a temporary OpenSpec root
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: the temporary root lives in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: change paths are joined per platform
import { join } from "node:path";
import process from "node:process";
import { writeChangeFolder } from "./openspec-folder.mjs";

const CHANGE_NAME = "issue-check";
const MAX_BUFFER = 16 * 1024 * 1024;
// cmd.exe prints this and exits 1 (or 9009) when a command does not exist.
const WIN_NOT_FOUND = /is not recognized as an internal or external command/i;
const WIN_NOT_FOUND_STATUS = 9009;

// On Windows the npm-installed CLI is a .cmd shim, which only a shell can run.
// Elsewhere the CLI starts directly, so no argument passes through a shell.
function runOpenspec(args, { cwd, env = process.env } = {}) {
  const result = spawnSync("openspec", args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const missing =
    result.error?.code === "ENOENT" ||
    result.status === WIN_NOT_FOUND_STATUS ||
    (process.platform === "win32" && WIN_NOT_FOUND.test(result.stderr ?? ""));
  return {
    missing,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

// Writes the change into a temporary OpenSpec root, calls `use(root, name)`,
// and removes the root afterwards, whatever `use` does.
function withChangeRoot(files, use) {
  const root = mkdtempSync(join(tmpdir(), "openspec-check-"));
  try {
    mkdirSync(join(root, "openspec", "specs"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n");
    writeChangeFolder(join(root, "openspec", "changes", CHANGE_NAME), files);
    return use(root, CHANGE_NAME);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function parseReport(stdout) {
  try {
    const report = JSON.parse(stdout);
    return Array.isArray(report?.items) ? report : null;
  } catch {
    return null;
  }
}

// Validates a change given as { proposal, design, specs, tasks } with
// `openspec validate --strict`. Returns { missing } when the CLI cannot start,
// { error } when its output is not a validation report, and otherwise
// { version, valid, issues }. Strict mode fails on warnings too, so `valid`
// comes from OpenSpec's own verdict, not from the issue levels.
function validateChange(files, options = {}) {
  const version = runOpenspec(["--version"], options);
  if (version.missing) return { missing: true };
  return withChangeRoot(files, (root, name) => {
    const run = runOpenspec(["validate", name, "--strict", "--json", "--no-interactive"], { ...options, cwd: root });
    if (run.missing) return { missing: true };
    const report = parseReport(run.stdout);
    if (report === null) {
      return { error: `openspec validate printed no validation report: ${(run.stderr || run.stdout).trim()}` };
    }
    const item = report.items[0] ?? { valid: false, issues: [] };
    return { version: version.stdout.trim(), valid: item.valid === true, issues: item.issues ?? [] };
  });
}

export { runOpenspec, validateChange, withChangeRoot };

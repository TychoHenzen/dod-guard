// cli.mjs - locate the OpenSpec CLI and run its reporting commands.
//
// Spawning "openspec" by name fails on Windows. The extensionless shim gives
// ENOENT, and the .cmd launcher gives EINVAL because Node will not spawn a
// batch file without a shell. Both launchers name the real entry file, so we
// read it back and run it with this process's own node. That also avoids
// hand-rolling shell quoting, which this repo has been burned by before.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, normalize } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Commands that only report state. The reader refuses anything else. */
const READ_COMMANDS = new Set(["list", "show", "status"]);
const LAUNCHER_NAMES = process.platform === "win32" ? ["openspec.cmd", "openspec"] : ["openspec"];
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

/** Both npm launchers quote the entry file, relative to their own directory. */
function entryFromLauncher(launcher) {
  const quoted = readFileSync(launcher, "utf8").match(/"([^"]+\.js)"/);
  if (!quoted) return null;
  const base = dirname(launcher).replace(/\\/g, "/");
  const substituted = quoted[1].replace(/%dp0%|\$basedir/gi, base).replace(/\\/g, "/");
  const entry = normalize(substituted.replace(/([^:])\/{2,}/g, "$1/"));
  return existsSync(entry) ? entry : null;
}

function entryInDir(dir) {
  for (const name of LAUNCHER_NAMES) {
    const launcher = join(dir, name);
    if (!existsSync(launcher)) continue;
    const entry = entryFromLauncher(launcher);
    if (entry) return entry;
  }
  return null;
}

function searchPath() {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    const entry = entryInDir(dir);
    if (entry) return entry;
  }
  return null;
}

/** Prefer an explicit override, then the launcher on the search path. */
export function locateCli() {
  const override = process.env.OPENSPEC_JS;
  if (override) return existsSync(override) ? override : null;
  return searchPath();
}

/** A failing command reports its reason as JSON on stdout, with stderr empty. */
function statusMessage(stdout) {
  try {
    const messages = JSON.parse(stdout).status.map((item) => item.message).filter(Boolean);
    return messages.join("; ") || null;
  } catch {
    return null;
  }
}

function firstLineOf(err) {
  const text = String(err.stderr || err.message || "");
  return text.trim().split("\n")[0];
}

function readFailure(args, err) {
  const reason = statusMessage(err.stdout) ?? firstLineOf(err);
  return new Error(`openspec ${args.join(" ")} failed: ${reason || "no output"}`);
}

export function createReader(entry) {
  return async function read(cwd, args) {
    if (!READ_COMMANDS.has(args[0])) {
      throw new Error(`refused: "${args[0]}" is not a read command`);
    }
    let stdout;
    try {
      ({ stdout } = await execFileAsync(process.execPath, [entry, ...args], {
        cwd,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      }));
    } catch (err) {
      throw readFailure(args, err);
    }
    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(`openspec ${args.join(" ")} returned output that is not JSON`);
    }
  };
}

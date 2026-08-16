// cli.mjs - locate the OpenSpec CLI and run its reporting commands.
//
// `list` runs in-process via ListCommand to avoid the ~1s subprocess
// startup cost. `show` and `status` still spawn because their root
// resolver reads process.cwd, which is not safe to change per-request.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, normalize } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const READ_COMMANDS = new Set(["list", "show", "status"]);
const LAUNCHER_NAMES = process.platform === "win32" ? ["openspec.cmd", "openspec"] : ["openspec"];
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

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

export function locateCli() {
  const override = process.env.OPENSPEC_JS;
  if (override) return existsSync(override) ? override : null;
  return searchPath();
}

function packageRoot(entry) {
  let dir = dirname(entry);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return null;
}

let ListCommandClass = null;

async function getListCommand(entry) {
  if (ListCommandClass) return ListCommandClass;
  const root = packageRoot(entry);
  if (!root) return null;
  const mod = await import(`file:///${root.replace(/\\/g, "/")}/dist/core/list.js`);
  ListCommandClass = mod.ListCommand;
  return ListCommandClass;
}

let captureLock = Promise.resolve();

async function captureJson(fn) {
  const prev = captureLock;
  let release;
  captureLock = new Promise((r) => { release = r; });
  await prev;
  const chunks = [];
  const origLog = console.log;
  console.log = (...args) => chunks.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.log = origLog;
    release();
  }
  const text = chunks.join("\n");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`openspec returned output that is not JSON: ${text.slice(0, 200)}`);
  }
}

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

async function readViaSubprocess(entry, cwd, args) {
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
}

async function listInProcess(entry, cwd, args) {
  const Cls = await getListCommand(entry);
  if (!Cls) return null;
  const isSpecs = args.includes("--specs");
  const cmd = new Cls();
  return captureJson(() => cmd.execute(cwd, isSpecs ? "specs" : "changes", { json: true }));
}

export function createReader(entry) {
  return async function read(cwd, args) {
    if (!READ_COMMANDS.has(args[0])) {
      throw new Error(`refused: "${args[0]}" is not a read command`);
    }
    if (args[0] === "list") {
      const result = await listInProcess(entry, cwd, args);
      if (result) return result;
    }
    return readViaSubprocess(entry, cwd, args);
  };
}

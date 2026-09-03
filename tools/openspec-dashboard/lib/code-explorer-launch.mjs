// code-explorer-launch.mjs - find the trusted Code Explorer package and spawn its fixed command.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { spawn as spawnChild } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { HttpError } from "./http-error.mjs";
import { createReadinessParser } from "./readiness.mjs";

const CHILD_ENV_NAMES = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "PYTHONUTF8",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "APPDATA",
  "LOCALAPPDATA",
];

const systemFs = {
  realpath: realpathSync,
  stat: statSync,
  readFile: readFileSync,
};

function unavailable() {
  throw new HttpError(503, "code_explorer_unavailable");
}

function parseMetadata(fs, path) {
  try {
    return JSON.parse(String(fs.readFile(path, "utf8")));
  } catch {
    unavailable();
  }
}

function validateEntry(entry, fs) {
  let canonicalEntry;
  try {
    canonicalEntry = fs.realpath(entry);
    if (!fs.stat(canonicalEntry).isFile()) unavailable();
  } catch {
    unavailable();
  }

  const packageRoot = dirname(dirname(canonicalEntry));
  if (relative(packageRoot, canonicalEntry).replaceAll("\\", "/") !== "dist/bundle.js") unavailable();

  const packageJson = parseMetadata(fs, join(packageRoot, "package.json"));
  const pluginJson = parseMetadata(fs, join(packageRoot, ".claude-plugin", "plugin.json"));
  if (packageJson?.name !== "code-explorer" || packageJson?.main !== "dist/bundle.js" || pluginJson?.name !== "code-explorer") {
    unavailable();
  }

  try {
    if (fs.realpath(join(packageRoot, packageJson.main)) !== canonicalEntry) unavailable();
  } catch {
    unavailable();
  }
  return canonicalEntry;
}

/** Resolve and validate the single startup-selected Code Explorer bundle. */
export function discoverCodeExplorer({ monorepoRoot, env = process.env, fs = systemFs }) {
  const selected =
    env.CODE_EXPLORER_JS === undefined
      ? join(monorepoRoot, "packages", "code-explorer", "dist", "bundle.js")
      : env.CODE_EXPLORER_JS;
  return validateEntry(selected, fs);
}

function childEnvironment(env) {
  return Object.fromEntries(CHILD_ENV_NAMES.filter((name) => env[name] !== undefined).map((name) => [name, env[name]]));
}

/** Spawn a validated bundle with no shell and no inherited configuration beyond the fixed allowlist. */
export function spawnCodeExplorer({
  entry,
  projectPath,
  monorepoRoot,
  env = process.env,
  execPath = process.execPath,
  spawn = spawnChild,
}) {
  return spawn(execPath, [entry, "serve", "--project-root", projectPath, "--no-open"], {
    cwd: monorepoRoot,
    env: childEnvironment(env),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

/** Start one fixed child and resolve only after its bounded readiness protocol succeeds. */
export function startCodeExplorer({
  entry,
  projectPath,
  monorepoRoot,
  env = process.env,
  execPath = process.execPath,
  spawn = spawnChild,
  createParser = createReadinessParser,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let child;
  try {
    child = spawnCodeExplorer({ entry, projectPath, monorepoRoot, env, execPath, spawn });
  } catch {
    return Promise.reject(new HttpError(503, "code_explorer_start_failed"));
  }

  return new Promise((resolve, reject) => {
    const parser = createParser();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      if (result?.url) {
        resolve({ child, url: result.url });
        return;
      }
      child.kill?.();
      reject(new HttpError(503, result?.error ?? "code_explorer_start_failed"));
    };
    const consume = (stream) => (chunk) => finish(parser.feed(stream, chunk));
    child.stdout?.on?.("data", consume("stdout"));
    child.stderr?.on?.("data", consume("stderr"));
    child.once?.("error", () => finish({ error: "code_explorer_start_failed" }));
    child.once?.("exit", () => finish(parser.end()));
    const timer = setTimer(() => finish(parser.deadline() ?? { error: "code_explorer_start_timeout" }), 30_000);
  });
}

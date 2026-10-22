import { spawn } from "node:child_process";
import process from "node:process";

function startFailure(startError) {
  return {
    code: null,
    signal: null,
    startError,
    stdinError: null,
    stderr: "",
    stdout: "",
    outputLimitExceeded: false,
    cancelled: false,
  };
}

// Resolves with the spawned `child`, or with the `failure` result of a spawn that threw.
export function startChild({ executable, args, cwd, env, spawnImpl = spawn }) {
  try {
    const stdio = ["pipe", "pipe", "pipe"];
    const detached = process.platform !== "win32";
    return { child: spawnImpl(executable, args, { cwd, env, shell: false, stdio, windowsHide: true, detached }) };
  } catch (error) {
    return { failure: startFailure(error) };
  }
}

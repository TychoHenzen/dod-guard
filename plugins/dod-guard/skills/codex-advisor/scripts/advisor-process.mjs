import { spawn } from "node:child_process";
import process from "node:process";
import { startChild } from "./advisor-spawn.mjs";

export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function childEnv(env) {
  return { ...process.env, ...env };
}

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

function bindAbort(signal, cancel) {
  if (signal?.aborted) {
    cancel();
    return;
  }
  signal?.addEventListener("abort", cancel, { once: true });
}

function isIgnorableStdinError(error, cancelled) {
  return cancelled && (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED");
}

function collectOutput(child, state, field) {
  child[field].setEncoding("utf8");
  child[field].on("data", (chunk) => {
    const next = state[field] + chunk;
    if (Buffer.byteLength(next, "utf8") <= MAX_OUTPUT_BYTES) {
      state[field] = next;
      return;
    }
    state.outputLimitExceeded = true;
    cancelProcessTree(child);
  });
}

function watchChild(child, signal, finish) {
  const state = { stdout: "", stderr: "", outputLimitExceeded: false, cancelled: false };
  const cancel = () => {
    state.cancelled = true;
    cancelProcessTree(child);
  };
  bindAbort(signal, cancel);
  collectOutput(child, state, "stdout");
  collectOutput(child, state, "stderr");
  child.once("error", (error) => {
    state.startError = error;
  });
  child.stdin.once("error", (error) => {
    if (!isIgnorableStdinError(error, state.cancelled)) state.stdinError = error;
  });
  child.once("close", (code, exitSignal) => {
    signal?.removeEventListener("abort", cancel);
    finish({ code, signal: exitSignal, ...state });
  });
}

// One process invocation: resolves with its captured output and failure flags, and never rejects.
export function runProcess({ prompt, signal, ...launch }) {
  return new Promise((resolveResult) => {
    const { child, failure } = startChild(launch);
    if (failure) {
      resolveResult(failure);
      return;
    }
    watchChild(child, signal, resolveResult);
    child.stdin.end(prompt);
  });
}

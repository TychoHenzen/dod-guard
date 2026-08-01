import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import type { SolveSession } from "./solve-session.js";

interface SpawnCall {
  prompt: string;
  opts: Record<string, unknown>;
}

/** Every spawnClaude call, in order. */
const spawns: SpawnCall[] = [];
let spawnRejects = false;

mock.module("./agent.js", {
  namedExports: {
    spawnClaude: mock.fn(async (prompt: string, opts: Record<string, unknown>) => {
      spawns.push({ prompt, opts });
      if (spawnRejects) throw new Error("no such binary");
      return { output: "done", exitCode: 0, durationMs: 12, timedOut: false };
    }),
  },
});

function openSession(): SolveSession {
  return {
    spec: {
      goal: "fix the login test",
      verify_cmd: "npm test",
      cwd: "/repo",
      model: "deepseek-chat",
      api_key: "sk-test",
    },
    rootBranch: "master",
    proxyReady: true,
    budgetExhausted: false,
  };
}

describe("solve-worker", () => {
  let spawnWorker: (prompt: string, session: SolveSession, timeoutMs: number) => Promise<Record<string, unknown>>;
  let FIRST_TIMEOUT_MS: number;
  let REPAIR_TIMEOUT_MS: number;

  before(async () => {
    const mod = await import("./solve-worker.js");
    spawnWorker = mod.spawnWorker as never;
    FIRST_TIMEOUT_MS = mod.FIRST_TIMEOUT_MS;
    REPAIR_TIMEOUT_MS = mod.REPAIR_TIMEOUT_MS;
  });

  function reset() {
    spawns.length = 0;
    spawnRejects = false;
  }

  it("allows five minutes for a first try and three for a repair", () => {
    assert.equal(FIRST_TIMEOUT_MS, 300_000);
    assert.equal(REPAIR_TIMEOUT_MS, 180_000);
  });

  it("runs the worker in the shared working directory with the session settings", async () => {
    reset();
    await spawnWorker("do the thing", openSession(), 1234);
    assert.equal(spawns.length, 1);
    assert.equal(spawns[0].prompt, "do the thing");
    assert.deepEqual(spawns[0].opts, {
      cwd: "/repo",
      model: "deepseek-chat",
      apiKey: "sk-test",
      useProxy: true,
      timeoutMs: 1234,
    });
  });

  it("tells the worker the proxy is down when the session says so", async () => {
    reset();
    const session = { ...openSession(), proxyReady: false };
    await spawnWorker("go", session, 10);
    assert.equal(spawns[0].opts.useProxy, false);
  });

  it("returns what the worker produced", async () => {
    reset();
    const result = await spawnWorker("go", openSession(), 10);
    assert.deepEqual(result, { output: "done", exitCode: 0, durationMs: 12, timedOut: false });
  });

  it("treats a worker that throws as a worker that said nothing", async () => {
    reset();
    spawnRejects = true;
    const result = await spawnWorker("go", openSession(), 10);
    assert.deepEqual(result, { output: "", exitCode: -1, durationMs: 0, timedOut: false });
  });

  it("does not call a failed run a timeout", async () => {
    reset();
    spawnRejects = true;
    assert.equal((await spawnWorker("go", openSession(), 10)).timedOut, false);
  });

  it("gives each failed run its own result to write on", async () => {
    reset();
    spawnRejects = true;
    const first = await spawnWorker("go", openSession(), 10);
    first.output = "tampered";
    const second = await spawnWorker("go", openSession(), 10);
    assert.equal(second.output, "");
  });
});

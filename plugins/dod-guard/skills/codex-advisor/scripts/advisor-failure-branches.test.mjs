import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { runAdvisor } from "./run-advisor.mjs";

// Characterization tests for runAdvisor's failure branches. A fake spawn stands in
// for Codex, so no real process starts and no fixture file changes.

function fakeChild(script) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  // child.pid stays undefined, so cancelProcessTree is a no-op.
  setImmediate(() => script(child));
  return child;
}

function spawnFor(handlers = {}, beforeReturn = () => {}) {
  const calls = [];
  const spawnImpl = (executable, args, options) => {
    const kind = args.includes("--version") ? "version" : args.includes("--help") ? "help" : "exec";
    calls.push({ kind, executable, args, options });
    beforeReturn(kind);
    const handler = handlers[kind] ?? ((child) => child.emit("close", 0, null));
    return fakeChild((child) => handler(child, args));
  };
  return { calls, spawnImpl };
}

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), "advisor-branches-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("preflight output limit stops before any reviewer spawn", async () => {
  await withRoot(async (root) => {
    const { calls, spawnImpl } = spawnFor({
      version: (child) => {
        child.stdout.emit("data", "x".repeat(8 * 1024 * 1024 + 1));
        child.emit("close", 0, null);
      },
    });
    const result = await runAdvisor({ executable: "fake-codex", prompt: "Problem", tempRoot: root, spawnImpl });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, false);
    assert.equal(result.error, "Codex advisor version capability probe exceeded 8388608 bytes");
    assert.equal(result.execution.status, "incomplete");
    assert.equal(result.execution.stage, "version");
    assert.equal(calls.length, 1);
  });
});

test("reviewer start error is reported at reviewer-launch", async () => {
  await withRoot(async (root) => {
    const { spawnImpl } = spawnFor({
      exec: (child) => {
        child.emit("error", new Error("boom"));
        child.emit("close", null, null);
      },
    });
    const result = await runAdvisor({ executable: "fake-codex", prompt: "Problem", tempRoot: root, spawnImpl });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, false);
    assert.equal(result.error, "Codex advisor executable is missing or cannot start (boom)");
    assert.equal(result.execution.stage, "reviewer-launch");
    assert.equal(result.execution.startError, "boom");
    assert.equal(result.execution.status, "incomplete");
  });
});

test("reviewer stdin error is reported at reviewer-launch", async () => {
  await withRoot(async (root) => {
    const { spawnImpl } = spawnFor({
      exec: (child) => {
        child.stdin.emit("error", Object.assign(new Error("pipe broke"), { code: "EIO" }));
        child.emit("close", 0, null);
      },
    });
    const result = await runAdvisor({ executable: "fake-codex", prompt: "Problem", tempRoot: root, spawnImpl });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, false);
    assert.equal(result.error, "Codex advisor prompt could not be written (pipe broke)");
    assert.equal(result.execution.stage, "reviewer-launch");
    assert.equal(result.execution.stdinError, "pipe broke");
  });
});

test("reviewer cancelled by the operator is reported at reviewer-process", async () => {
  await withRoot(async (root) => {
    const controller = new AbortController();
    const { spawnImpl } = spawnFor(
      {
        exec: (child) => child.emit("close", null, "SIGTERM"),
      },
      (kind) => {
        if (kind === "exec") controller.abort();
      },
    );
    const result = await runAdvisor({
      executable: "fake-codex",
      prompt: "Problem",
      tempRoot: root,
      signal: controller.signal,
      spawnImpl,
    });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, false);
    assert.equal(result.error, "Codex advisor cancelled by operator");
    assert.equal(result.execution.stage, "reviewer-process");
    assert.equal(result.execution.signal, "SIGTERM");
    assert.equal(result.execution.status, "incomplete");
  });
});

function fakeReviewerExec(child, args) {
  writeFileSync(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ advice: "x" }));
  child.stdout.emit("data", `${JSON.stringify({ type: "turn.started" })}\n`);
  child.stdout.emit(
    "data",
    `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "a" } })}\n`,
  );
  child.emit("close", 0, null);
}

test("response parser throw is reported at reviewer-report", async () => {
  await withRoot(async (root) => {
    const { spawnImpl } = spawnFor({
      exec: (child, args) => fakeReviewerExec(child, args),
    });
    const result = await runAdvisor({
      executable: "fake-codex",
      prompt: "Problem",
      tempRoot: root,
      spawnImpl,
      parseResponse: () => {
        throw new Error("bad parser");
      },
    });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, false);
    assert.equal(result.error, "Codex advisor output could not be parsed (bad parser)");
    assert.equal(result.execution.stage, "reviewer-report");
  });
});

test("fake reviewer success", async () => {
  await withRoot(async (root) => {
    const { spawnImpl } = spawnFor({
      exec: (child, args) => fakeReviewerExec(child, args),
    });
    const result = await runAdvisor({ executable: "fake-codex", prompt: "Problem", tempRoot: root, spawnImpl });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, true);
    assert.equal(result.advice, "x");
    assert.equal(result.execution.status, "completed");
    assert.deepEqual(Object.keys(result.capability.probes).sort(), ["help", "version"]);
  });
});

test("temp directory that cannot be created fails at launcher-contract", async () => {
  await withRoot(async (root) => {
    const { calls, spawnImpl } = spawnFor();
    const result = await runAdvisor({
      executable: "fake-codex",
      prompt: "Problem",
      tempRoot: join(root, "missing", "deeper"),
      spawnImpl,
    });
    assert.deepEqual(await readdir(root), []);
    assert.equal(result.ok, false);
    assert.match(result.error, /^Codex advisor could not start: /);
    assert.equal(result.execution.stage, "launcher-contract");
    assert.equal(result.execution.status, "incomplete");
    assert.equal(calls.length, 0);
  });
});

test("launcher resolution that throws escapes as a rejection", async () => {
  await withRoot(async (root) => {
    const { calls, spawnImpl } = spawnFor();
    const env = {};
    Object.defineProperty(env, "PATH", {
      enumerable: true,
      get() {
        throw new Error("env boom");
      },
    });
    await assert.rejects(
      runAdvisor({ env, platform: "win32", prompt: "Problem", tempRoot: root, spawnImpl }),
      /env boom/,
    );
    assert.deepEqual(await readdir(root), []);
    assert.equal(calls.length, 0);
  });

  await withRoot(async (root) => {
    const { calls, spawnImpl } = spawnFor();
    const prefixArgs = new Proxy([], {
      get(target, key, receiver) {
        if (key === Symbol.iterator) throw new Error("prefix boom");
        return Reflect.get(target, key, receiver);
      },
    });
    await assert.rejects(
      runAdvisor({ executable: "fake-codex", prefixArgs, prompt: "Problem", tempRoot: root, spawnImpl }),
      /prefix boom/,
    );
    assert.deepEqual(await readdir(root), []);
    assert.equal(calls.length, 0);
  });
});

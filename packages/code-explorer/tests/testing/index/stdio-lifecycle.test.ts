import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import process from "node:process";
import { it } from "node:test";
import {
  createStdioCloseController,
  installStdioCloseTriggers,
} from "../../../src/stdio-lifecycle.js";
import { FakeTimers } from "../freshness/workspace-freshness/fake-timers.js";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const neverSettles = () => new Promise<void>(() => undefined);

it("exits 0 after a clean close and releases resources before closing the core", async () => {
  const calls: string[] = [];
  const errors: string[] = [];
  const timers = new FakeTimers();
  const closer = createStdioCloseController({
    closeCore: async () => {
      calls.push("closeCore");
    },
    releaseResources: () => {
      calls.push("release");
    },
    exit: (code) => {
      calls.push(`exit:${code}`);
    },
    writeError: (line) => {
      errors.push(line);
    },
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  closer.close("stdin_end");
  await settle();
  assert.deepEqual(calls, ["release", "closeCore", "release", "exit:0"]);
  assert.deepEqual(errors, []);
});

it("force-kills, writes one stderr line, and exits 1 when the close step overruns 1500 ms", () => {
  const timers = new FakeTimers();
  const errors: string[] = [];
  const exits: number[] = [];
  let releases = 0;
  const closer = createStdioCloseController({
    closeCore: neverSettles,
    releaseResources: () => {
      releases += 1;
    },
    exit: (code) => {
      exits.push(code);
    },
    writeError: (line) => {
      errors.push(line);
    },
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  closer.close("stdin_end");
  timers.fire(1500);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /exceeded 1500 ms/);
  assert.deepEqual(exits, [1]);
  assert.ok(releases >= 2, `releases=${releases}`);
});

it("a second signal exits at once with code 1", () => {
  const errors: string[] = [];
  const exits: number[] = [];
  const closer = createStdioCloseController({
    closeCore: neverSettles,
    releaseResources: () => undefined,
    exit: (code) => {
      exits.push(code);
    },
    writeError: (line) => {
      errors.push(line);
    },
    setTimer: new FakeTimers().set,
    clearTimer: () => undefined,
  });
  closer.close("signal");
  closer.close("signal");
  assert.deepEqual(exits, [1]);
  assert.deepEqual(errors, []);
});

it("a rejected close exits 1 with no unhandled rejection", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  const exits: number[] = [];
  const errors: string[] = [];
  process.on("unhandledRejection", onUnhandled);
  try {
    const closer = createStdioCloseController({
      closeCore: () => Promise.reject(new Error("core_failed")),
      releaseResources: () => undefined,
      exit: (code) => {
        exits.push(code);
      },
      writeError: (line) => {
        errors.push(line);
      },
      setTimer: () => undefined,
      clearTimer: () => undefined,
    });
    closer.close("stdin_end");
    await settle();
    assert.deepEqual(unhandled, []);
    assert.deepEqual(exits, [1]);
    assert.match(errors[0] ?? "", /core_failed/);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

it("closing exposes true after the first close", () => {
  const closer = createStdioCloseController({
    closeCore: neverSettles,
    releaseResources: () => undefined,
    exit: () => undefined,
    writeError: () => undefined,
    setTimer: () => undefined,
    clearTimer: () => undefined,
  });
  assert.equal(closer.closing, false);
  closer.close("stdin_end");
  assert.equal(closer.closing, true);
});

it("installStdioCloseTriggers routes SIGINT, SIGTERM and stdin end", () => {
  const signals = new EventEmitter();
  const stdin = new EventEmitter();
  const reasons: string[] = [];
  installStdioCloseTriggers({
    signals,
    stdin,
    close: (reason) => {
      reasons.push(reason);
    },
  });
  signals.emit("SIGINT");
  signals.emit("SIGINT");
  signals.emit("SIGTERM");
  stdin.emit("end");
  stdin.emit("end");
  assert.deepEqual(reasons, ["signal", "signal", "signal", "stdin_end"]);
});

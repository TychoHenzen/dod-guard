import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { before, describe, it, mock } from "node:test";

let _notify: typeof import("./notify.js") | null = null;
let spawnThrows = false;
let emitErrorAfterSpawn = false;

async function getNotify(): Promise<typeof import("./notify.js")> {
  if (_notify) return _notify;
  mock.module("node:child_process", {
    namedExports: {
      spawn: mock.fn((_cmd: string, _args: string[], _opts?: any) => {
        if (spawnThrows) throw new Error("spawn ENOENT");

        const cp = new EventEmitter() as EventEmitter & { stdout: EventEmitter; unref: () => void };
        cp.stdout = new EventEmitter();
        cp.unref = () => {};

        if (emitErrorAfterSpawn) {
          // Emit error on next tick — tests the child.on("error") handler
          setImmediate(() => {
            cp.emit("error", new Error("powershell.exe not found"));
          });
        }
        return cp;
      }),
    },
  });
  _notify = await import("./notify.js");
  return _notify;
}

describe("playJingle", () => {
  let playJingle: typeof import("./notify.js").playJingle;

  before(async () => {
    spawnThrows = false;
    emitErrorAfterSpawn = false;
    const notify = await getNotify();
    playJingle = notify.playJingle;
  });

  it("is callable", () => assert.equal(typeof playJingle, "function"));
  it("does not throw (happy path)", () => assert.doesNotThrow(() => playJingle()));
  it("does not throw with extra args", () => assert.doesNotThrow(() => (playJingle as any)(null, undefined, 42)));
  it("does not throw on rapid calls", () => {
    for (let i = 0; i < 10; i++) playJingle();
  });
  it("returns undefined", () => assert.equal(playJingle(), undefined));
  it("function name", () => assert.equal(playJingle.name, "playJingle"));

  it("catches spawn sync error", () => {
    spawnThrows = true;
    assert.doesNotThrow(() => playJingle());
    spawnThrows = false;
  });

  it("handles child process async error event", () => {
    emitErrorAfterSpawn = true;
    assert.doesNotThrow(() => playJingle());
    emitErrorAfterSpawn = false;
  });
});

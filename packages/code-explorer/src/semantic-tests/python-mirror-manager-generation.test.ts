import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { createPythonMirrorManager } from "../semantic/\
python-mirror/python-mirror-runtime.js";
import { project } from "../testing/runtime/\
python-mirror-runtime-test-support.js";

async function expectGeneration(
  manager: ReturnType<typeof createPythonMirrorManager>,
  generation: number,
): Promise<void> {
  const result = await manager.refresh();
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("expected ready mirror");
  assert.equal(result.mirror.generation, generation);
}

function blockFirstTermination() {
  let release!: () => void, signalStarted!: () => void;
  const blocked = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (signalStarted = resolve));
  let blockNextTermination = true;
  return {
    started,
    release,
    terminate: async () => {
      if (!blockNextTermination) return;
      blockNextTermination = false;
      signalStarted();
      await blocked;
    },
  };
}

it("rebuilds with monotonic generations after config addition", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("old-backend-terminated");
  });
  try {
    await expectGeneration(manager, 0);
    await expectGeneration(manager, 0);
    assert.deepEqual(events, []);
    writeFileSync(join(fixture.root, "pyrightconfig.json"), "{}\n");
    await expectGeneration(manager, 1);
    assert.deepEqual(events, ["old-backend-terminated"]);
    writeFileSync(
      join(fixture.root, "pyrightconfig.json"),
      '{"pythonVersion":"3.11"}\n',
    );
    await expectGeneration(manager, 2);
    rmSync(join(fixture.root, "pyrightconfig.json"));
    await expectGeneration(manager, 3);
    writeFileSync(join(fixture.root, "src", "a.py"), "x = 2\n");
    await expectGeneration(manager, 4);
    assert.deepEqual(events, Array(4).fill("old-backend-terminated"));
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("serializes concurrent refreshes \
into ordered mirror generations", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const termination = blockFirstTermination();
  const manager = createPythonMirrorManager(
    fixture.project,
    termination.terminate,
  );
  try {
    await expectGeneration(manager, 0);
    writeFileSync(join(fixture.root, "pyrightconfig.json"), "{}\n");
    const first = manager.refresh();
    await termination.started;
    writeFileSync(
      join(fixture.root, "pyrightconfig.json"),
      '{"pythonVersion":"3.11"}\n',
    );
    const second = manager.refresh();
    termination.release();
    const results = await Promise.all([first, second]);
    for (const result of results) assert.equal(result.status, "ready");
    if (results[0].status !== "ready" || results[1].status !== "ready")
      throw new Error("expected ready mirrors");
    assert.equal(results[0].mirror.generation, 1);
    assert.equal(results[1].mirror.generation, 2);
    assert.equal(manager.current()?.generation, 2);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

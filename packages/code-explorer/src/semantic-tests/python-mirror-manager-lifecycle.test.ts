import assert from "node:assert/strict";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import {
  createNativePythonMirror,
  createPythonMirrorManager,
} from "../semantic/python-mirror/python-mirror-runtime.js";
import { project } from "../testing/python-mirror-runtime-test-support.js";

function linkConfiguration(root: string): void {
  symlinkSync(join(root, "replacement.json"), join(root, "pyrightconfig.json"), "file");
}

it("retires an active backend before a linked configura", async (context) => {
  const fixture = project({
    "src/a.py": "x = 1\n",
    "replacement.json": "{}\n",
  });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("shutdown-complete");
  });
  try {
    assert.equal((await manager.refresh()).status, "ready");
    try {
      linkConfiguration(fixture.root);
    } catch (error) {
      context.skip(`symbolic links unavailable: ${String(error)}`);
      return;
    }
    assert.deepEqual(await manager.refresh(), {
      status: "unavailable",
      code: "unsafe_backend_mode",
    });
    assert.deepEqual(events, ["shutdown-complete"]);
    assert.equal(manager.current(), undefined);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("terminates a backend before disposing its mirror", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const manager = createPythonMirrorManager(fixture.project);
  const result = await manager.refresh();
  if (result.status !== "ready") throw new Error("expected ready mirror");
  const generation = result.mirror.root;
  const events: string[] = [];
  await manager.disposeAfterShutdown(() => {
    events.push("child-shutdown");
  });
  fixture.dispose();
  assert.deepEqual(events, ["child-shutdown"]);
  assert.equal(existsSync(generation), false);
});

it("rejects linked project source", (context) => {
  const fixture = project({ "src/real.py": "x = 1\n" });
  const linked = join(fixture.root, "src", "linked.py");
  try {
    try {
      symlinkSync(join(fixture.root, "src", "real.py"), linked, "file");
    } catch (error) {
      context.skip(`symbolic links unavailable: ${String(error)}`);
      return;
    }
    assert.throws(() => createNativePythonMirror(fixture.project), {
      message: "unsafe_backend_mode",
    });
  } finally {
    fixture.dispose();
  }
});

it("removes the owned generation on dispose", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  const generation = mirror.root;
  mirror.dispose();
  fixture.dispose();
  assert.equal(existsSync(generation), false);
});

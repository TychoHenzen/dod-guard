import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { project } from "../testing/python-mirror-runtime-test-support.js";
import { createPythonMirrorManager } from "../semantic/python-mirror/python-mirror-runtime.js";

it("terminates the old backend before an unsafe replacement an", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("terminate-before-rebuild");
  });
  try {
    assert.equal((await manager.refresh()).status, "ready");
    writeFileSync(
      join(fixture.root, "pyrightconfig.json"),
      '{"venvPath":".venv"}\n',
    );
    assert.deepEqual(await manager.refresh(), {
      status: "unavailable",
      code: "unsafe_backend_mode",
    });
    assert.deepEqual(events, ["terminate-before-rebuild"]);
    assert.equal(manager.current(), undefined);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("retires an active backend before malformed configuration c", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("shutdown-complete");
  });
  try {
    assert.equal((await manager.refresh()).status, "ready");
    writeFileSync(join(fixture.root, "pyrightconfig.json"), "{ malformed");
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

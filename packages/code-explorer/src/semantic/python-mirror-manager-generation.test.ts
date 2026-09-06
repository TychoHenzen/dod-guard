import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { project } from "../testing/python-mirror-runtime-test-support.js";
import { createPythonMirrorManager } from "./python-mirror-runtime.js";

async function expectGeneration(
  manager: ReturnType<typeof createPythonMirrorManager>,
  generation: number,
): Promise<void> {
  const result = await manager.refresh();
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("expected ready mirror");
  assert.equal(result.mirror.generation, generation);
}

function assertFourTerminations(events: string[]): void {
  assert.deepEqual(events, Array(4).fill("old-backend-terminated"));
}

it("rebuilds with monotonic generations after config addition,", async () => {
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
    assertFourTerminations(events);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

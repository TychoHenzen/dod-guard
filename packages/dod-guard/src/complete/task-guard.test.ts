import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { TaskItem } from "../openspec/tasks-parser.js";
import { detectTampering, guardExists, revertTampering, snapshotTasks } from "./task-guard.js";

function makeTask(id: string, checked: boolean, status?: string): TaskItem {
  return { id, text: `Task ${id}`, checked, coversId: undefined, status };
}

describe("task-guard", () => {
  let tmpDir: string;
  let tasksPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-guard-"));
    tasksPath = path.join(tmpDir, "tasks.md");
    await fs.writeFile(tasksPath, "placeholder", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("guardExists returns false when no shadow file exists", async () => {
    assert.equal(await guardExists(tasksPath), false);
  });

  it("snapshotTasks creates a shadow file and guardExists returns true", async () => {
    const tasks = [makeTask("1.1", false), makeTask("1.2", true, "completed")];
    await snapshotTasks(tasksPath, tasks);
    assert.equal(await guardExists(tasksPath), true);
  });

  it("detectTampering returns shadowMissing when no shadow exists", async () => {
    const tasks = [makeTask("1.1", true)];
    const result = await detectTampering(tasksPath, tasks);
    assert.equal(result.shadowMissing, true);
    assert.equal(result.tampered.length, 0);
  });

  it("detectTampering finds no tampering when state matches shadow", async () => {
    const tasks = [makeTask("1.1", false), makeTask("1.2", true, "completed")];
    await snapshotTasks(tasksPath, tasks);
    const result = await detectTampering(tasksPath, tasks);
    assert.equal(result.shadowMissing, false);
    assert.equal(result.tampered.length, 0);
  });

  it("detectTampering catches a task checked outside the gate", async () => {
    const original = [makeTask("1.1", false), makeTask("1.2", false)];
    await snapshotTasks(tasksPath, original);

    const tampered = [makeTask("1.1", true), makeTask("1.2", false)];
    const result = await detectTampering(tasksPath, tampered);
    assert.equal(result.shadowMissing, false);
    assert.equal(result.tampered.length, 1);
    assert.equal(result.tampered[0].taskId, "1.1");
    assert.equal(result.tampered[0].field, "checked");
  });

  it("detectTampering catches a status changed outside the gate", async () => {
    const original = [makeTask("1.1", false)];
    await snapshotTasks(tasksPath, original);

    const tampered = [makeTask("1.1", false, "completed")];
    const result = await detectTampering(tasksPath, tampered);
    assert.equal(result.tampered.length, 1);
    assert.equal(result.tampered[0].field, "status");
  });

  it("detectTampering marks a forged shadow file as corrupted", async () => {
    const forged = JSON.stringify({ v: 1, tasks: { "1.1": { checked: true } }, hmac: "bad" });
    await fs.writeFile(path.join(tmpDir, ".task-guard.json"), forged, "utf-8");

    const tasks = [makeTask("1.1", true)];
    const result = await detectTampering(tasksPath, tasks);
    assert.equal(result.shadowCorrupted, true);
    assert.equal(result.shadowMissing, false);
  });

  it("revertTampering unchecks tampered tasks", () => {
    const content = "- [x] 1.1 Add parser\n<!-- status: completed -->\n- [ ] 1.2 Other\n";
    const tampered = [{ taskId: "1.1", field: "checked" as const, shadowValue: false, diskValue: true }];
    const reverted = revertTampering(content, tampered);
    assert.ok(reverted.includes("[ ] 1.1"));
    assert.ok(reverted.includes("status: reverted"));
  });
});

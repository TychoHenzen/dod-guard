import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { EXIT_OK, EXIT_USAGE, runLock } from "./run.js";

const TASKS_MD = `## 1. Setup

- [ ] 1.1 Add the parser
<!-- status: pending -->

- [ ] 1.2 Write tests
<!-- status: pending -->
`;

describe("runLock", () => {
  let tmpDir: string;
  let written: string[];
  let errors: string[];
  const io = {
    write: (s: string) => written.push(s),
    writeErr: (s: string) => errors.push(s),
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-test-"));
    written = [];
    errors = [];
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns EXIT_USAGE when tasks.md does not exist", async () => {
    const code = await runLock({ cwd: tmpDir, changeId: "no-such" }, io);
    assert.equal(code, EXIT_USAGE);
    assert.ok(errors.some((s) => s.includes("not found")));
  });

  it("creates .task-guard.json on first lock", async () => {
    const changeDir = path.join(tmpDir, "openspec", "changes", "test-change");
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "tasks.md"), TASKS_MD, "utf-8");

    const code = await runLock({ cwd: tmpDir, changeId: "test-change" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(written.some((s) => s.includes("locked")));
    assert.ok(written.some((s) => s.includes("2 task(s)")));

    const guardPath = path.join(changeDir, ".task-guard.json");
    const stat = await fs.stat(guardPath);
    assert.ok(stat.isFile());
  });

  it("re-locks when guard already exists", async () => {
    const changeDir = path.join(tmpDir, "openspec", "changes", "test-change");
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "tasks.md"), TASKS_MD, "utf-8");

    await runLock({ cwd: tmpDir, changeId: "test-change" }, io);
    written = [];

    const code = await runLock({ cwd: tmpDir, changeId: "test-change" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(written.some((s) => s.includes("re-locked")));
  });
});

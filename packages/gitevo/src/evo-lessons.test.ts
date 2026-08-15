import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { resolveRoot } from "./evo-git.js";
import { evo_export_lessons, evo_learn, evo_lessons, recordLesson } from "./evo-lessons.js";
import { closeMemoryDb } from "./memory.js";

let dir = "";
let root = "";
let origCwd = "";

before(() => {
  origCwd = process.cwd();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitevo-lessons-"));
  for (const args of [["init"], ["config", "user.name", "t"], ["config", "user.email", "t@t.com"]]) {
    spawnSync("git", args, { cwd: dir, encoding: "utf-8" });
  }
  fs.writeFileSync(path.join(dir, "file.txt"), "hello");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
  fs.mkdirSync(path.join(dir, ".evo"), { recursive: true });
  process.chdir(dir);
  root = resolveRoot(dir);
});

after(() => {
  process.chdir(origCwd);
  closeMemoryDb(root);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("lessons", () => {
  // covers: gitevo/lesson-export :: Listing lessons shows the newest first :: No lessons recorded
  it("reports the empty case", () => assert.equal(evo_lessons(), "No lessons recorded."));

  // covers: gitevo/lesson-export :: Export emits JSON the obsidian-rag memory_save tool accepts :: Empty store exports as an empty array
  it("exports the empty case as exactly []", () => assert.equal(evo_export_lessons(), "[]"));

  // covers: gitevo/lesson-export :: Recording a lesson attributes it to the active branch :: Lesson recorded on the current branch
  it("attributes a lesson to the current branch", () => {
    const result = evo_learn("first lesson", { cwd: dir, rootBranch: "main" });
    assert.match(result, /^Lesson recorded on branch '.+'\.$/);
  });

  // covers: gitevo/lesson-export :: Listing lessons shows the newest first :: Multiple lessons listed newest first
  it("numbers lessons newest first", () => {
    recordLesson(root, "side", "second lesson");
    const listed = evo_lessons().split("\n");
    assert.ok(listed[0].startsWith("[1] "), listed[0]);
    assert.ok(listed[0].includes("(side): second lesson"), listed[0]);
    assert.ok(listed[1].includes("first lesson"), listed[1]);
  });

  it("exports memory ready entries, newest first", () => {
    const entries = JSON.parse(evo_export_lessons());
    assert.equal(entries.length, 2);
    assert.equal(entries[0].content, "second lesson");
    assert.equal(entries[0].title, "second lesson");
    assert.equal(entries[0].type, "feedback");
    assert.equal(entries[0].description, "GitEvo lesson from branch 'side'");
    assert.deepEqual(entries[0].metadata.source, "gitevo");
    assert.ok(entries[0].id.startsWith("gitevo-"));
    assert.equal(entries[0].id.length, "gitevo-".length + 12);
  });

  // covers: gitevo/lesson-export :: Export identifiers are content-derived and idempotent :: Re-export produces identical ids
  it("gives the same ids on re-export", () => {
    const first = JSON.parse(evo_export_lessons()).map((e: { id: string }) => e.id);
    const again = JSON.parse(evo_export_lessons()).map((e: { id: string }) => e.id);
    assert.deepEqual(first, again);
  });

  // covers: gitevo/lesson-export :: Export emits JSON the obsidian-rag memory_save tool accepts :: Long lesson content is truncated in the title only
  it("truncates a long title at 80 characters", () => {
    recordLesson(root, "side", "x".repeat(200));
    assert.equal(JSON.parse(evo_export_lessons()).length, 3);
    assert.equal(JSON.parse(evo_export_lessons())[0].title.length, 80);
  });
});

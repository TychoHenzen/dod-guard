import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { readCommittedSnapshot, readStagedSnapshot } from "./snapshot.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-snapshot-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(path.join(root, "old.ts"), "export class Moved {}\n");
  writeFileSync(path.join(root, "edit.ts"), "export const before = 1;\n");
  writeFileSync(path.join(root, "deleted.ts"), "export const removed = 1;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  return root;
}
test("reads staged objects rather than later working tree edits", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "edit.ts"), "export const staged = 2;\n");
    git(root, ["add", "edit.ts"]);
    writeFileSync(path.join(root, "edit.ts"), "export const unstaged = 3;\n");
    const snapshot = readStagedSnapshot(root);
    assert.equal(snapshot.changes[0]?.after?.content, "export const staged = 2;\n");
    assert.equal(readFileSync(path.join(root, "edit.ts"), "utf8"), "export const unstaged = 3;\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("normalizes staged rename, addition, edit, and deletion snapshots", () => {
  const root = fixture();
  try {
    mkdirSync(path.join(root, "domain"));
    git(root, ["mv", "old.ts", "domain/moved.ts"]);
    writeFileSync(path.join(root, "edit.ts"), "export const after = 2;\n");
    writeFileSync(path.join(root, "added.ts"), "export const added = 1;\n");
    git(root, ["rm", "deleted.ts"]);
    git(root, ["add", "."]);
    const snapshot = readStagedSnapshot(root);
    assert.deepEqual(
      snapshot.changes.map((change) => [change.kind, change.before?.path, change.after?.path]),
      [
        ["add", undefined, "added.ts"],
        ["delete", "deleted.ts", undefined],
        ["rename", "old.ts", "domain/moved.ts"],
        ["modify", "edit.ts", "edit.ts"],
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("reconstructs committed changes against the first parent", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "edit.ts"), "export const committed = 2;\n");
    git(root, ["add", "edit.ts"]);
    git(root, ["commit", "-m", "change"]);
    const snapshot = readCommittedSnapshot(root, "HEAD");
    assert.equal(snapshot.baseIdentity, git(root, ["rev-parse", "HEAD^"]).trim());
    assert.equal(snapshot.changes[0]?.after?.content, "export const committed = 2;\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

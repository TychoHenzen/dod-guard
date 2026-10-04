import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SOURCE = [
  "def deeply_nested(value):",
  ...Array.from(
    { length: 6 },
    (_, index) => `${" ".repeat((index + 1) * 4)}if value:`,
  ),
  "                            return value",
  "    return value",
].join("\n");

test("a multi-file apply_patch emits one JSON document with all contexts", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-multi-file-"));
  const repository = resolve(directory, "repository");
  mkdirSync(join(repository, ".git"), { recursive: true });
  writeFileSync(join(repository, "first.py"), SOURCE);
  writeFileSync(join(repository, "second.py"), SOURCE);
  const launcher = resolve(
    import.meta.dirname,
    "../../scripts/quality-guard.mjs",
  );
  const patch = [
    "*** Begin Patch",
    "*** Update File: first.py",
    "@@",
    "+# first touched line",
    "*** Update File: second.py",
    "@@",
    "+# second touched line",
    "*** End Patch",
  ].join("\n");
  const result = spawnSync(process.execPath, [launcher], {
    input: JSON.stringify({
      cwd: repository,
      tool_name: "apply_patch",
      tool_input: { command: patch },
    }),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  const protocol = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(protocol.hookEventName, "PostToolUse");
  assert.match(protocol.additionalContext, /first\.py/);
  assert.match(protocol.additionalContext, /second\.py/);
  rmSync(directory, { recursive: true });
});

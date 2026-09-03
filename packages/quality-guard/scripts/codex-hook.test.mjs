import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { scopeToChangedLines } from "./changed-lines.mjs";
import { hookTargets } from "./hook-targets.mjs";
import { shouldGate } from "./quality-guard.mjs";

test("Claude write calls keep their file target", () => {
  const input = {
    tool_name: "Write",
    tool_input: { file_path: "C:\\repo\\src\\one.ts" },
  };

  const targets = hookTargets(input);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].filePath, input.tool_input.file_path);
  assert.equal(targets[0].input, input);
});

test("Codex apply_patch calls expose each surviving file target", () => {
  const cwd = resolve("fixture-repo");
  const input = {
    cwd,
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Update File: src/one.ts",
        "@@",
        "+const one = true;",
        "*** Add File: src/two.ts",
        "+const two = true;",
        "*** Delete File: src/old.ts",
        "*** End Patch",
      ].join("\n"),
    },
  };

  const targets = hookTargets(input);

  assert.deepEqual(
    targets.map((target) => target.filePath),
    [resolve(cwd, "src/one.ts"), resolve(cwd, "src/two.ts")],
  );
  assert.deepEqual(targets[0].input.tool_input.added_runs, ["const one = true;"]);
  assert.deepEqual(targets[1].input.tool_input.added_runs, ["const two = true;"]);
});

test("Codex added runs scope linter findings to their final lines", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-codex-"));
  const filePath = resolve(directory, "one.ts");
  const input = {
    tool_name: "apply_patch",
    tool_input: {
      file_path: filePath,
      added_runs: ["  const added = true;\n  return added;"],
    },
  };
  const text = [
    "function existing() {",
    "  const added = true;",
    "  return added;",
    "}",
  ].join("\n");
  writeFileSync(filePath, text);

  assert.deepEqual(scopeToChangedLines(input, [
    { line: 1, message: "old" },
    { line: 2, message: "new" },
    { line: 3, message: "new" },
    { line: 4, message: "old" },
  ]), [
    { line: 2, message: "new" },
    { line: 3, message: "new" },
  ]);
  rmSync(directory, { recursive: true });
});
test("unsupported tools and Markdown writes have no quality-gate target", () => {
  assert.deepEqual(hookTargets({ tool_name: "Bash", tool_input: {} }), []);
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-markdown-"));
  const filePath = resolve(directory, "notes.md");
  writeFileSync(filePath, "# Notes\n");
  assert.equal(shouldGate({ tool_name: "Write", tool_input: { file_path: filePath } }), false);
  rmSync(directory, { recursive: true });
});

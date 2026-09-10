import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { hookTargets } from "./hook-targets.mjs";

test("unsupported tools and Markdown have no gate target", () => {
  assert.deepEqual(hookTargets({ tool_name: "Bash", tool_input: {} }), []);
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-markdown-"));
  const filePath = resolve(directory, "notes.md");
  writeFileSync(filePath, "# Notes\n");
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "quality-guard.mjs")],
    {
      input: JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: filePath },
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0);
  rmSync(directory, { recursive: true });
});

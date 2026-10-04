import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";
import { gate } from "../../scripts/quality-guard-gate.mjs";
import {
  fakeInput,
  gateDeps,
  testTarget,
} from "./git-tracked-adoption-fixtures.test.mjs";

test("an explicit linter-unavailable result reports actionable JSON evidence", () => {
  const { root, filePath } = testTarget("linter-state.js");
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    const value = gate(
      fakeInput(filePath),
      filePath,
      gateDeps({
        runScanner: () => ({ violations: [] }),
        localResult: () => ({ unavailable: "configured linter timed out" }),
      }),
    );
    assert.equal(value, 0);
  } finally {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  }
  const protocol = JSON.parse(output);
  assert.equal(protocol.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(
    protocol.hookSpecificOutput.additionalContext,
    /project-linter unavailable: configured linter timed out/,
  );
});

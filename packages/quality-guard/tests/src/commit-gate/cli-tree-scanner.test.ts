import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { scannerEvidence } from "../../../src/commit-gate/cli-tree-scanner.js";

test("failed tree materialization removes its temp tree", () => {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-materialize-"));
  const tempVariables = ["TMPDIR", "TMP", "TEMP"] as const;
  const previousTempValues = new Map(
    tempVariables.map((name) => [name, process.env[name]]),
  );
  for (const name of tempVariables) process.env[name] = root;
  try {
    const result = scannerEvidence(root, "missing-ref");
    assert.deepEqual(result.findings, []);
    assert.equal(result.errors?.length, 1);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    for (const name of tempVariables) {
      const previousValue = previousTempValues.get(name);
      if (previousValue === undefined) delete process.env[name];
      else process.env[name] = previousValue;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

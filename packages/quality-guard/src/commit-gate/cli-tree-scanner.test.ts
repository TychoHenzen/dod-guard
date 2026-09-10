import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { scannerEvidence } from "./cli-tree-scanner.js";

test("failed tree materialization removes its temp tree", () => {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-materialize-"));
  const tempPrefix = "quality-guard-index-";
  const before = readdirSync(tmpdir()).filter((name) =>
    name.startsWith(tempPrefix),
  );
  try {
    const result = scannerEvidence(root, "missing-ref");
    assert.deepEqual(result.findings, []);
    assert.equal(result.errors?.length, 1);
    assert.deepEqual(
      readdirSync(tmpdir()).filter((name) => name.startsWith(tempPrefix)),
      before,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

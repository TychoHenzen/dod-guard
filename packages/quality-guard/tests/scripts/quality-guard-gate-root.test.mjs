import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { findRepoRoot } from "../../scripts/quality-guard-gate-scan.mjs";
import { tempRepo } from "./git-tracked-adoption-fixtures.test.mjs";

test("repository discovery reaches roots beyond forty directory levels", () => {
  const root = tempRepo();
  const filePath = join(
    root,
    ...Array.from({ length: 41 }, (_, index) => `level-${index}`),
    "deep.js",
  );
  assert.equal(findRepoRoot(filePath), root);
  rmSync(root, { recursive: true, force: true });
});

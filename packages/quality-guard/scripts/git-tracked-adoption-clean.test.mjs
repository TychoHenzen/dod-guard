import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gate } from "./quality-guard-gate.mjs";
import { OVER_BOUND_LINES } from "./git-tracked-adoption-fixtures.test.mjs";
import { fakeInput } from "./git-tracked-adoption-fixtures.test.mjs";
import { gateDeps } from "./git-tracked-adoption-fixtures.test.mjs";
import { tempRepo } from "./git-tracked-adoption-fixtures.test.mjs";
import { writeBaselineFile } from "./git-tracked-adoption-fixtures.test.mjs";
import { writeTarget } from "./git-tracked-adoption-fixtures.test.mjs";

test("a clean file-local write passes without changing the baseline", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "file-local.js", 10);
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");
  assert.equal(
    gate(fakeInput(filePath), filePath, gateDeps({ isTracked: () => false })),
    0,
  );
  assert.equal(readFileSync(baselinePath, "utf8"), before);
  rmSync(root, { recursive: true, force: true });
});

test("an allowed tracked source write preserves the adopted baseline", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "allowed.js", 10);
  const baselinePath = writeBaselineFile(root, ["allowed.js"], {});
  const before = readFileSync(baselinePath, "utf8");
  assert.equal(
    gate(fakeInput(filePath), filePath, gateDeps({ isTracked: () => true })),
    0,
  );
  assert.equal(readFileSync(baselinePath, "utf8"), before);
  rmSync(root, { recursive: true, force: true });
});

test("a missing baseline still runs file-local hard-bound checks", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "no-baseline.js", OVER_BOUND_LINES);
  assert.equal(
    gate(fakeInput(filePath), filePath, gateDeps({ isTracked: () => true })),
    2,
  );
  assert.equal(
    existsSync(join(root, ".github", "quality", "quality-baseline.json")),
    false,
  );
  rmSync(root, { recursive: true, force: true });
});

test("Git tracking failure falls back to new-file behavior", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "big.js", OVER_BOUND_LINES);
  writeBaselineFile(root, [], {});
  assert.equal(gate(fakeInput(filePath), filePath, gateDeps()), 2);
  rmSync(root, { recursive: true, force: true });
});

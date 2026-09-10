import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { test } from "node:test";
import { gate } from "./quality-guard-gate.mjs";
import { OVER_BOUND_LINES } from "./git-tracked-adoption-fixtures.test.mjs";
import { fakeInput } from "./git-tracked-adoption-fixtures.test.mjs";
import { gateDeps } from "./git-tracked-adoption-fixtures.test.mjs";
import { tempRepo } from "./git-tracked-adoption-fixtures.test.mjs";
import { writeBaselineFile } from "./git-tracked-adoption-fixtures.test.mjs";
import { writeTarget } from "./git-tracked-adoption-fixtures.test.mjs";

const alwaysTracked = () => true;

test(
  "an unseen source file over the normal bound blocks without changing the " +
    "baseline",
  () => {
    const root = tempRepo();
    const filePath = writeTarget(root, "big.js", OVER_BOUND_LINES);
    const baselinePath = writeBaselineFile(root, [], {});
    const before = readFileSync(baselinePath, "utf8");
    const code = gate(
      fakeInput(filePath),
      filePath,
      gateDeps({ isTracked: alwaysTracked }),
    );
    assert.equal(code, 2);
    assert.equal(readFileSync(baselinePath, "utf8"), before);
    rmSync(root, { recursive: true, force: true });
  },
);

test("a blocked tracked source write preserves the tracked baseline", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "blocked.js", OVER_BOUND_LINES);
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");
  const code = gate(
    fakeInput(filePath),
    filePath,
    gateDeps({ isTracked: () => true }),
  );
  assert.equal(code, 2);
  assert.equal(readFileSync(baselinePath, "utf8"), before);
  rmSync(root, { recursive: true, force: true });
});

test("an untracked source file is held to the same normal bound", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "big.js", OVER_BOUND_LINES);
  const baselinePath = writeBaselineFile(root, [], {});
  const code = gate(
    fakeInput(filePath),
    filePath,
    gateDeps({ isTracked: () => false }),
  );
  assert.equal(code, 2);
  assert.deepEqual(JSON.parse(readFileSync(baselinePath, "utf8")).files, []);
  rmSync(root, { recursive: true, force: true });
});

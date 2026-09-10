import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gate } from "./quality-guard-gate.mjs";
import {
  fakeInput,
  gateDeps,
  tempRepo,
  writeBaselineFile,
} from "./git-tracked-adoption-fixtures.test.mjs";

test("two top-level types block without baseline adoption", () => {
  const root = tempRepo();
  const filePath = join(root, "two-types.js");
  writeFileSync(filePath, "class One {}\nclass Two {}\n");
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");
  assert.equal(gate(fakeInput(filePath), filePath, gateDeps()), 2);
  assert.equal(readFileSync(baselinePath, "utf8"), before);
  rmSync(root, { recursive: true, force: true });
});

test("a known tracked file blocks on a todo-marker regression", () => {
  const root = tempRepo();
  const filePath = join(root, "known.js");
  writeFileSync(filePath, "// TODO: left behind\n".repeat(5));
  writeBaselineFile(root, ["known.js"], { "known.js::todo-marker": 4 });
  const code = gate(
    fakeInput(filePath),
    filePath,
    gateDeps({ isTracked: () => true }),
  );
  assert.equal(code, 2);
  rmSync(root, { recursive: true, force: true });
});

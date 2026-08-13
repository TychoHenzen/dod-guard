import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { writeUnwiredCoverageGateSpec } from "./spec-fixtures.js";

let cwd: string;

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-spec-fixtures-"));
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

test("writes a spec.md with one requirement and one unwired scenario", async () => {
  await writeUnwiredCoverageGateSpec(cwd);
  const raw = await fs.readFile(
    path.join(cwd, "openspec", "specs", "dod-guard", "coverage-gate", "spec.md"),
    "utf-8",
  );
  assert.match(raw, /### Requirement: cover reports a scenario's state/);
  assert.match(raw, /#### Scenario: unwired/);
});

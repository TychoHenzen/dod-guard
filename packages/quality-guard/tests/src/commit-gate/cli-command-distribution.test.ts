import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { runStagedCheck } from "../../../src/commit-gate/cli.js";
import { parityFixture } from "./cli-command-test-support.js";

test("ignores generated distribution JavaScript in the commit decision", () => {
  const root = parityFixture();
  try {
    const distribution = path.join(root, "packages", "fixture", "dist");
    mkdirSync(distribution, { recursive: true });
    writeFileSync(
      path.join(distribution, "bundle.js"),
      "export class BundledDependency {",
    );
    const result = runStagedCheck(root, { json: true, intent: "change" });
    assert.equal(result.verdict, "PASS");
    assert.match(
      result.input.reason ?? "",
      /No source quality decision was required/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

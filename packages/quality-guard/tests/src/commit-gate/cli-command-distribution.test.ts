import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import {
  runCommittedCheck,
  runStagedCheck,
} from "../../../src/commit-gate/cli.js";
import { parityFixture } from "./cli-command-test-support.js";

const checkOptions = { json: true, intent: "change" as const };

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function hasRatchetRegression(result: { findings: Array<{ reason: string }> }) {
  return result.findings.some(
    (finding) =>
      finding.reason ===
      "structural ratchet reported a deterministic regression",
  );
}

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

test("enforces wildcard imports and stays quiet after staged recovery", () => {
  const python = "packages/fixture/src/wildcard.py";
  const typescript = "packages/fixture/src/source.ts";
  const root = parityFixture({ [python]: "from package import Item\n" });
  try {
    writeFileSync(path.join(root, python), "from package import *\n");
    git(root, ["add", python]);
    assert.equal(
      hasRatchetRegression(runStagedCheck(root, checkOptions)),
      true,
    );
    git(root, ["commit", "-m", "add wildcard import"]);
    assert.equal(
      hasRatchetRegression(runCommittedCheck(root, "HEAD", checkOptions)),
      true,
    );

    writeFileSync(path.join(root, python), "from package import Item\n");
    const sourcePath = path.join(root, typescript);
    writeFileSync(
      sourcePath,
      `import * as api from "./module.js";\n${readFileSync(sourcePath, "utf8")}`,
    );
    git(root, ["add", python, typescript]);
    assert.equal(
      hasRatchetRegression(runStagedCheck(root, checkOptions)),
      false,
    );
    git(root, ["commit", "-m", "recover with explicit import"]);
    assert.equal(
      hasRatchetRegression(runCommittedCheck(root, "HEAD", checkOptions)),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

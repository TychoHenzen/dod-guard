import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import {
  runCheckCommand,
  runCommittedCheck,
  runStagedCheck,
} from "../../../src/commit-gate/cli.js";
import { parityFixture } from "./cli-command-test-support.js";

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

test("runs the same decision against staged and committed fixtures", () => {
  const root = parityFixture();
  try {
    const source = path.join(root, "packages", "fixture", "src", "source.ts");
    writeFileSync(
      source,
      'export class Existing { private value = "this line is deliberately ' +
        'longer than eighty characters but remains within the Biome limit"; ' +
        "public added(): string { return this.value; } }\n",
    );
    git(root, ["add", "packages/fixture/src/source.ts"]);
    const local = runStagedCheck(root, { json: true, intent: "change" });
    git(root, ["commit", "-m", "change without hook"]);
    const committed = runCommittedCheck(root, "HEAD", {
      json: true,
      intent: "change",
    });
    const command = runCheckCommand(["check", "--committed", "HEAD"], root);
    assert.equal(committed.verdict, local.verdict);
    assert.deepEqual(
      committed.findings.map((finding) => finding.id),
      local.findings.map((finding) => finding.id),
    );
    assert.equal(
      local.findings.some(
        (finding) =>
          finding.reason ===
          "structural ratchet reported a deterministic regression",
      ),
      false,
      "the commit decision must use CI's rule set and exclude line length",
    );
    assert.equal(
      command.exitCode,
      committed.verdict === "PASS" ? 0 : committed.verdict === "FAIL" ? 1 : 2,
    );
    assert.equal(JSON.parse(command.output).verdict, committed.verdict);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { runScan } from "../scanner.js";
import { runAcknowledgeCommand } from "./cli-command-acknowledge.js";
import { runStagedCheck } from "./cli-decision.js";

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function fixture(): string {
  const root = fs.mkdtempSync(
    path.join(tmpdir(), "quality-guard-acknowledge-"),
  );
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  fs.mkdirSync(path.join(root, ".github", "quality"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages", "fixture", "src"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "packages", "fixture", "src", "source.ts"),
    "export class Existing {}\n",
  );
  const baseline = runScan({
    paths: ["packages"],
    root,
    excludes: ["/dist/", "node_modules"],
    writeBaseline: ".github/quality/quality-baseline.json",
  });
  assert.equal(baseline.exitCode, 0);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  return root;
}

test("reports invalid acknowledgement command arguments", () => {
  const result = runAcknowledgeCommand(["acknowledge"], process.cwd());
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /--finding requires/);
});

test("writes an acknowledgement for a staged review finding", () => {
  const root = fixture();
  try {
    fs.writeFileSync(
      path.join(root, ".quality-guard.json"),
      '{"genericBuckets":["src"]}\n',
    );
    fs.writeFileSync(
      path.join(root, "packages", "fixture", "src", "Added.ts"),
      "export class Added {}\n",
    );
    git(root, ["add", ".quality-guard.json", "packages/fixture/src/Added.ts"]);
    const decision = runStagedCheck(root, { json: false, intent: "change" });
    const finding = decision.findings.find(
      (item) => item.severity === "review",
    );
    assert.ok(finding);

    const result = runAcknowledgeCommand(
      [
        "acknowledge",
        "--finding",
        finding.id,
        "--reason",
        "accepted test finding",
        "--author",
        "tester",
      ],
      root,
    );
    assert.equal(result.exitCode, 0);
    assert.match(result.output, new RegExp(finding.id));
    assert.match(
      fs.readFileSync(
        path.join(root, ".github", "quality", "architecture-decisions.json"),
        "utf8",
      ),
      new RegExp(finding.id),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

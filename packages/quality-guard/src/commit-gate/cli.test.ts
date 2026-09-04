import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { runScan } from "../scanner.js";
import {
  exitCodeFor,
  parseAcknowledgeArguments,
  parseCheckArguments,
  renderDecision,
  runCheckCommand,
  runCommittedCheck,
  runStagedCheck,
} from "./cli.js";
import type { DecisionResult } from "./types.js";

const review: DecisionResult = {
  verdict: "REVIEW_REQUIRED",
  findings: [
    { id: "finding", severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" },
  ],
  errors: [],
  input: { baseIdentity: "base", targetIdentity: "index", changedSourcePaths: ["src/a.ts"] },
};
test("parses the ordinary staged command with change intent", () => {
  assert.deepEqual(parseCheckArguments(["check", "--staged"]), { json: false, intent: "change", target: undefined });
});
test("refactor intent without a target is a usage error", () => {
  const result = parseCheckArguments(["check", "--staged", "--intent", "refactor"]);
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match("output" in result ? result.output : "", /requires --target/);
});
test("review-required maps to hook-blocking exit code and matching renderers", () => {
  assert.equal(exitCodeFor(review), 2);
  assert.match(renderDecision(review, false), /^REVIEW_REQUIRED/m);
  assert.equal(JSON.parse(renderDecision(review, true)).verdict, "REVIEW_REQUIRED");
});
test("unsupported intent is a usage error", () => {
  const result = parseCheckArguments(["check", "--staged", "--intent=surprise"]);
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match("output" in result ? result.output : "", /Usage/);
});

test("acknowledge requires a finding, reason, and author", () => {
  assert.deepEqual(
    parseAcknowledgeArguments([
      "acknowledge",
      "--finding",
      "finding",
      "--reason",
      "Reviewed",
      "--author",
      "A. Reviewer",
    ]),
    {
      findingId: "finding",
      reason: "Reviewed",
      author: "A. Reviewer",
    },
  );
  const result = parseAcknowledgeArguments([
    "acknowledge",
    "--finding",
    "finding",
    "--reason",
    "",
    "--author",
    "A. Reviewer",
  ]);
  assert.equal("exitCode" in result && result.exitCode, 3);
});

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function parityFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-parity-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(path.join(root, ".github", "quality"), { recursive: true });
  mkdirSync(path.join(root, "packages", "fixture", "src"), { recursive: true });
  writeFileSync(
    path.join(root, "packages", "fixture", "src", "source.ts"),
    'export class Existing { private value = "short"; public added(): string { return this.value; } }\n',
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
test("runs the same decision against staged and committed fixtures", () => {
  const root = parityFixture();
  try {
    const source = path.join(root, "packages", "fixture", "src", "source.ts");
    writeFileSync(
      source,
      'export class Existing { private value = "this line is deliberately longer than eighty characters but remains within the Biome limit"; public added(): string { return this.value; } }\n',
    );
    git(root, ["add", "packages/fixture/src/source.ts"]);
    const local = runStagedCheck(root, { json: true, intent: "change" });
    git(root, ["commit", "-m", "change without hook"]);
    const committed = runCommittedCheck(root, "HEAD", { json: true, intent: "change" });
    const command = runCheckCommand(["check", "--committed", "HEAD"], root);
    assert.equal(committed.verdict, local.verdict);
    assert.deepEqual(
      committed.findings.map((finding) => finding.id),
      local.findings.map((finding) => finding.id),
    );
    assert.equal(
      local.findings.some((finding) => finding.reason === "structural ratchet reported a deterministic regression"),
      false,
      "the commit decision must use CI's rule set and exclude line length",
    );
    assert.equal(command.exitCode, committed.verdict === "PASS" ? 0 : committed.verdict === "FAIL" ? 1 : 2);
    assert.equal(JSON.parse(command.output).verdict, committed.verdict);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores generated distribution JavaScript in the commit decision", () => {
  const root = parityFixture();
  try {
    const distribution = path.join(root, "packages", "fixture", "dist");
    mkdirSync(distribution, { recursive: true });
    writeFileSync(path.join(distribution, "bundle.js"), "export class BundledDependency {");
    git(root, ["add", "packages/fixture/dist/bundle.js"]);

    const result = runStagedCheck(root, { json: true, intent: "change" });

    assert.equal(result.verdict, "PASS");
    assert.match(result.input.reason ?? "", /No source quality decision was required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

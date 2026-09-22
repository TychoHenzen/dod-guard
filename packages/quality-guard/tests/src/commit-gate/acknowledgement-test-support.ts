import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runAcknowledgeCommand } from "../../../src/commit-gate/cli-command-acknowledge.js";
import { runStagedCheck } from "../../../src/commit-gate/cli-decision.js";
import { runScan } from "../../../src/scanner.js";

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function fixture(): string {
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

export function stagedReview(root: string) {
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
  const finding = decision.findings.find((item) => item.severity === "review");
  assert.ok(finding);
  return { decision, finding };
}

export function failingDecision(decision: ReturnType<typeof runStagedCheck>) {
  return {
    ...decision,
    findings: decision.findings.map((item) => ({
      ...item,
      severity: "fail" as const,
    })),
  };
}

export function acknowledge(
  root: string,
  findingId: string,
  options: { reason?: string; committedRef?: string } = {},
) {
  const args = [
    "acknowledge",
    "--finding",
    findingId,
    "--reason",
    options.reason ?? "accepted test finding",
    "--author",
    "tester",
  ];
  if (options.committedRef) args.push("--committed", options.committedRef);
  return runAcknowledgeCommand(args, root);
}

export function withFixture(action: (root: string) => void): () => void {
  return () => {
    const root = fixture();
    try {
      action(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

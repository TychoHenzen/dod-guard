import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runScan, type ScanRequest } from "../scanner.js";
import type { Snapshot } from "./snapshot.js";
import type { DecisionResult } from "./types.js";

// The commit gate follows CI's structural rules. Biome owns line length, and
// generated dist output is excluded because bundles have a separate gate.
const RATCHET_RULES = [
  "file-length",
  "function-length",
  "complexity",
  "param-count",
  "nesting-depth",
  "types-per-file",
  "duplicate-block",
  "else-branch",
  "unnamed-tuple",
  "dead-export",
  "unused-local",
  "test-only-export",
  "commented-out-code",
  "todo-marker",
  "stateless-method",
  "comment-bloat",
  "comment-restates-code",
  "assumption-marker",
];

function commitScanRequest(root: string): ScanRequest {
  return {
    paths: ["packages"],
    root,
    rules: RATCHET_RULES,
    excludes: ["/dist/", "node_modules"],
    baseline: ".github/quality/quality-baseline.json",
    failOn: "regression",
  };
}

function materializeTree(root: string, ref: string, target: string): void {
  if (ref === "index") {
    execFileSync(
      "git",
      ["checkout-index", "--all", `--prefix=${target}${path.sep}`],
      { cwd: root, stdio: "ignore" },
    );
    return;
  }
  const indexPath = path.join(target, "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  execFileSync("git", ["read-tree", ref], { cwd: root, env, stdio: "ignore" });
  execFileSync(
    "git",
    ["checkout-index", "--all", `--prefix=${target}${path.sep}`],
    { cwd: root, env, stdio: "ignore" },
  );
  rmSync(indexPath, { force: true });
}

export function scannerEvidence(
  root: string,
  ref: string,
): {
  findings: Array<Omit<DecisionResult["findings"][number], "id">>;
  errors?: string[];
} {
  let stagedRoot: string | undefined;
  try {
    stagedRoot = mkdtempSync(path.join(tmpdir(), "quality-guard-index-"));
    materializeTree(root, ref, stagedRoot);
    const result = runScan(commitScanRequest(stagedRoot));
    if (result.exitCode === 0) return { findings: [] };
    return {
      findings: [
        {
          severity: "fail",
          affectedPaths: [],
          before: {},
          after: { exitCode: result.exitCode, report: result.report },
          reason: "structural ratchet reported a deterministic regression",
        },
      ],
    };
  } catch (error) {
    return {
      findings: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    if (stagedRoot) rmSync(stagedRoot, { recursive: true, force: true });
  }
}

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runScan, type ScanRequest } from "../scanner.js";
import { appendArchitectureAcknowledgement, parseArchitectureAcknowledgements } from "./acknowledgements.js";
import { parseQualityConfig } from "./config.js";
import { decideQuality, type ScannerEvidence } from "./decision-core.js";
import { extractFactInventory } from "./facts.js";
import { DECISION_RECORD_PATH } from "./fingerprint.js";
import { parseResponsibilityMap } from "./responsibility-map.js";
import {
  readCommittedSnapshot,
  readSourceInventory,
  readStagedSnapshot,
  type Snapshot,
  type TreeReference,
} from "./snapshot.js";
import type { DecisionResult, FindingInput } from "./types.js";

export interface CheckOptions {
  json: boolean;
  intent: "change" | "refactor";
  target?: string;
}

export interface CommandResult {
  exitCode: number;
  output: string;
}

export interface AcknowledgeOptions {
  findingId: string;
  reason: string;
  author: string;
}

// Keep the authoritative commit decision on the same scanner contract as CI.
// Biome owns line length, and the distribution output is not source debt.
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

/** Builds the scanner request shared by staged and committed decisions. */
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

function usage(message?: string): CommandResult {
  return {
    exitCode: 3,
    output: `${message ? `Usage error: ${message}\n` : ""}Usage: quality-guard check --staged [--intent change|refactor] [--target <repository-relative-path>] [--json]`,
  };
}

function acknowledgeUsage(message?: string): CommandResult {
  return {
    exitCode: 3,
    output: `${message ? `Usage error: ${message}\n` : ""}Usage: quality-guard acknowledge --finding <finding-id> --reason <reason> --author <author>`,
  };
}

function validTarget(value: string): boolean {
  return (
    Boolean(value.trim()) &&
    !path.isAbsolute(value) &&
    !/^[a-zA-Z]:[\\/]/.test(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

/** Parses only the public staged command. All unsupported options are usage errors. */
export function parseCheckArguments(args: string[]): CheckOptions | CommandResult {
  if (args[0] !== "check" || args[1] !== "--staged") return usage();
  let json = false;
  let intent: "change" | "refactor" = "change";
  let target: string | undefined;
  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--intent") {
      const value = args[++index];
      if (value !== "change" && value !== "refactor") return usage(`unsupported intent ${value ?? ""}`.trim());
      intent = value;
    } else if (arg.startsWith("--intent=")) {
      const value = arg.slice("--intent=".length);
      if (value !== "change" && value !== "refactor") return usage(`unsupported intent ${value}`);
      intent = value;
    } else if (arg === "--target") {
      target = args[++index];
      if (!target) return usage("--target requires a repository-relative path");
    } else if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length);
    } else {
      return usage(`unsupported option ${arg}`);
    }
  }
  if (intent === "refactor" && !target) return usage("refactor intent requires --target");
  if (target && !validTarget(target)) return usage("--target must be a repository-relative path");
  return { json, intent, target };
}

/** Parses the public acknowledgement command. Its fields become tracked review evidence. */
export function parseAcknowledgeArguments(args: string[]): AcknowledgeOptions | CommandResult {
  if (args[0] !== "acknowledge") return acknowledgeUsage();
  let findingId: string | undefined;
  let reason: string | undefined;
  let author: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const value = arg.startsWith("--finding=")
      ? arg.slice("--finding=".length)
      : arg.startsWith("--reason=")
        ? arg.slice("--reason=".length)
        : arg.startsWith("--author=")
          ? arg.slice("--author=".length)
          : args[++index];
    if (arg === "--finding" || arg.startsWith("--finding=")) findingId = value;
    else if (arg === "--reason" || arg.startsWith("--reason=")) reason = value;
    else if (arg === "--author" || arg.startsWith("--author=")) author = value;
    else return acknowledgeUsage(`unsupported option ${arg}`);
  }
  if (!findingId?.trim()) return acknowledgeUsage("--finding requires a finding identifier");
  if (!reason?.trim()) return acknowledgeUsage("--reason requires a non-empty reason");
  if (!author?.trim()) return acknowledgeUsage("--author requires a non-empty author");
  return { findingId: findingId.trim(), reason: reason.trim(), author: author.trim() };
}

export function exitCodeFor(result: DecisionResult): number {
  return result.verdict === "PASS" ? 0 : result.verdict === "FAIL" ? 1 : 2;
}

export function renderDecision(result: DecisionResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  const lines: string[] = [result.verdict];
  if (result.input.reason) lines.push(result.input.reason);
  for (const error of result.errors) lines.push(`ERROR: ${error}`);
  for (const finding of result.findings)
    lines.push(`${finding.severity.toUpperCase()}: ${finding.reason} (${finding.id})`);
  for (const findingId of result.staleAcknowledgements ?? [])
    lines.push(`STALE: acknowledgement for ${findingId} does not match the current staged fingerprint`);
  if (result.refactorProgress) {
    for (const [name, indicator] of Object.entries(result.refactorProgress.indicators)) {
      lines.push(`REFACTOR: ${name} ${indicator.status} (${indicator.before} -> ${indicator.after})`);
    }
  }
  return lines.join("\n");
}

function materializeTree(root: string, ref: TreeReference): string {
  const target = mkdtempSync(path.join(tmpdir(), "quality-guard-index-"));
  if (ref === "index") {
    execFileSync("git", ["checkout-index", "--all", `--prefix=${target}${path.sep}`], { cwd: root, stdio: "ignore" });
    return target;
  }
  const indexPath = path.join(target, "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  execFileSync("git", ["read-tree", ref], { cwd: root, env, stdio: "ignore" });
  execFileSync("git", ["checkout-index", "--all", `--prefix=${target}${path.sep}`], {
    cwd: root,
    env,
    stdio: "ignore",
  });
  rmSync(indexPath, { force: true });
  return target;
}

function scannerEvidence(root: string, ref: TreeReference): ScannerEvidence {
  const stagedRoot = materializeTree(root, ref);
  try {
    const result = runScan(commitScanRequest(stagedRoot));
    if (result.exitCode === 0) return { findings: [] };
    const finding: FindingInput = {
      severity: "fail",
      affectedPaths: [],
      before: {},
      after: { exitCode: result.exitCode, report: result.report },
      reason: "structural ratchet reported a deterministic regression",
    };
    return { findings: [finding] };
  } catch (error) {
    return { findings: [], errors: [error instanceof Error ? error.message : String(error)] };
  } finally {
    rmSync(stagedRoot, { recursive: true, force: true });
  }
}

function isSourceOrConfiguration(filePath: string): boolean {
  return (
    /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i.test(filePath) ||
    filePath === ".quality-guard.json"
  );
}

function isDistributionPath(filePath: string): boolean {
  return /(?:^|[/\\])dist(?:[/\\]|$)/.test(filePath);
}

function withoutDistributionChanges(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    changes: snapshot.changes.filter((change) => {
      const paths = [change.before?.path, change.after?.path].filter((filePath): filePath is string =>
        Boolean(filePath),
      );
      return paths.some((filePath) => !isDistributionPath(filePath));
    }),
  };
}

function treeFile(root: string, ref: TreeReference, filePath: string, fallback?: string): string {
  try {
    return execFileSync("git", ["show", ref === "index" ? `:${filePath}` : `${ref}:${filePath}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error(`${filePath} is not present in ${ref === "index" ? "the staged index" : `tree ${ref}`}`);
  }
}

function snapshotConfig(root: string, ref: TreeReference): string {
  return treeFile(root, ref, ".quality-guard.json", "{}");
}

function decisionForSnapshot(
  root: string,
  snapshot: Snapshot,
  baseRef: TreeReference,
  targetRef: TreeReference,
  options: CheckOptions,
): DecisionResult {
  const decisionSnapshot = withoutDistributionChanges(snapshot);
  const refactorMap =
    options.intent === "refactor" && options.target
      ? parseResponsibilityMap(treeFile(root, targetRef, options.target))
      : undefined;
  const affected = decisionSnapshot.changes
    .flatMap((change) => [change.before?.path, change.after?.path])
    .filter((filePath): filePath is string => Boolean(filePath));
  if (!affected.some(isSourceOrConfiguration)) {
    return decideQuality({
      snapshot: decisionSnapshot,
      config: parseQualityConfig("{}"),
      beforeFiles: [],
      afterFiles: [],
      scanner: { findings: [] },
    });
  }
  const config = parseQualityConfig(snapshotConfig(root, targetRef));
  const before = extractFactInventory(readSourceInventory(root, baseRef), affected);
  const after = extractFactInventory(readSourceInventory(root, targetRef), affected);
  const acknowledgementRecords = parseArchitectureAcknowledgements(
    treeFile(root, targetRef, DECISION_RECORD_PATH, "[]"),
  );
  return decideQuality({
    snapshot: decisionSnapshot,
    config,
    beforeFiles: before.files,
    afterFiles: after.files,
    analysisErrors: [...before.errors, ...after.errors],
    scanner: scannerEvidence(root, targetRef),
    acknowledgementRecords,
    refactorMap,
  });
}

/** Runs the index-only staged decision, including tracked review and refactor evidence. */
export function runStagedCheck(root: string, options: CheckOptions): DecisionResult {
  const snapshot = readStagedSnapshot(root);
  return decisionForSnapshot(root, snapshot, "HEAD", "index", options);
}

/** Replays the staged decision against a committed tree and its first parent for CI. */
export function runCommittedCheck(root: string, commit: string, options: CheckOptions): DecisionResult {
  const snapshot = readCommittedSnapshot(root, commit);
  return decisionForSnapshot(root, snapshot, `${commit}^`, commit, options);
}

function runAcknowledgeCommand(args: string[], root: string): CommandResult {
  const options = parseAcknowledgeArguments(args);
  if ("exitCode" in options) return options;
  try {
    const decision = runStagedCheck(root, { json: false, intent: "change" });
    const finding = decision.findings.find((item) => item.id === options.findingId);
    if (!finding) return acknowledgeUsage(`unknown or stale finding ${options.findingId}`);
    if (finding.severity !== "review")
      return acknowledgeUsage(`finding ${options.findingId} is deterministic and cannot be acknowledged`);
    if (!decision.fingerprint) return acknowledgeUsage("no current staged source fingerprint is available");
    const recordPath = path.join(root, DECISION_RECORD_PATH);
    let source = "[]";
    try {
      source = readFileSync(recordPath, "utf8");
    } catch {
      // A newly introduced tracked record begins as an empty array.
    }
    mkdirSync(path.dirname(recordPath), { recursive: true });
    writeFileSync(
      recordPath,
      appendArchitectureAcknowledgement(source, {
        ...options,
        fingerprint: decision.fingerprint,
        time: new Date().toISOString(),
      }),
      "utf8",
    );
    execFileSync("git", ["add", "--", DECISION_RECORD_PATH], { cwd: root, stdio: "ignore" });
    return { exitCode: 0, output: `Acknowledged review finding ${options.findingId}` };
  } catch (error) {
    return acknowledgeUsage(error instanceof Error ? error.message : String(error));
  }
}

export function runCheckCommand(args: string[], root = process.cwd()): CommandResult {
  if (args[0] === "acknowledge") return runAcknowledgeCommand(args, root);
  if (args[0] === "check" && args[1] === "--committed") {
    const commit = args[2];
    if (!commit || commit.startsWith("-")) return usage("--committed requires a Git ref");
    const options = parseCheckArguments(["check", "--staged", "--json", ...args.slice(3)]);
    if ("exitCode" in options) return options;
    try {
      const result = runCommittedCheck(root, commit, options);
      return { exitCode: exitCodeFor(result), output: renderDecision(result, true) };
    } catch (error) {
      return usage(error instanceof Error ? error.message : String(error));
    }
  }
  const options = parseCheckArguments(args);
  if ("exitCode" in options) return options;
  try {
    const result = runStagedCheck(root, options);
    return { exitCode: exitCodeFor(result), output: renderDecision(result, options.json) };
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
}

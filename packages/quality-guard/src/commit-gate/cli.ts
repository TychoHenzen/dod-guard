import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parseQualityConfig } from "./config.js";
import { decideQuality, type ScannerEvidence } from "./decision-core.js";
import { extractFactInventory } from "./facts.js";
import { readSourceInventory, readStagedSnapshot } from "./snapshot.js";
import type { DecisionResult, FindingInput } from "./types.js";
import { runScan } from "../scanner.js";

export interface CheckOptions {
  json: boolean;
  intent: "change" | "refactor";
  target?: string;
}

export interface CommandResult {
  exitCode: number;
  output: string;
}

function usage(message?: string): CommandResult {
  return {
    exitCode: 3,
    output: `${message ? `Usage error: ${message}\n` : ""}Usage: quality-guard check --staged [--intent change|refactor] [--target <repository-relative-path>] [--json]`,
  };
}

function validTarget(value: string): boolean {
  return Boolean(value.trim()) && !path.isAbsolute(value) && !/^[a-zA-Z]:[\\/]/.test(value) && !value.split(/[\\/]/).includes("..");
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

export function exitCodeFor(result: DecisionResult): number {
  return result.verdict === "PASS" ? 0 : result.verdict === "FAIL" ? 1 : 2;
}

export function renderDecision(result: DecisionResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  const lines: string[] = [result.verdict];
  if (result.input.reason) lines.push(result.input.reason);
  for (const error of result.errors) lines.push(`ERROR: ${error}`);
  for (const finding of result.findings) lines.push(`${finding.severity.toUpperCase()}: ${finding.reason} (${finding.id})`);
  return lines.join("\n");
}

function materializeIndex(root: string): string {
  const target = mkdtempSync(path.join(tmpdir(), "quality-guard-index-"));
  execFileSync("git", ["checkout-index", "--all", `--prefix=${target}${path.sep}`], { cwd: root, stdio: "ignore" });
  return target;
}

function scannerEvidence(root: string): ScannerEvidence {
  const stagedRoot = materializeIndex(root);
  try {
    const result = runScan({ paths: ["."], root: stagedRoot, baseline: ".github/quality/quality-baseline.json", failOn: "regression" });
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
  return /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i.test(filePath) || filePath === ".quality-guard.json";
}

function stagedConfig(root: string, snapshot: ReturnType<typeof readStagedSnapshot>): string {
  const change = snapshot.changes.find((item) => item.after?.path === ".quality-guard.json");
  if (change?.after) return change.after.content;
  try {
    return execFileSync("git", ["show", ":.quality-guard.json"], { cwd: root, encoding: "utf8" });
  } catch {
    return "{}";
  }
}

/** Runs the index-only staged decision. A refactor target is syntax-checked here; map loading comes later. */
export function runStagedCheck(root: string, options: CheckOptions): DecisionResult {
  const snapshot = readStagedSnapshot(root);
  const affected = snapshot.changes.flatMap((change) => [change.before?.path, change.after?.path]).filter((filePath): filePath is string => Boolean(filePath));
  if (!affected.some(isSourceOrConfiguration)) {
    return decideQuality({ snapshot, config: parseQualityConfig("{}"), beforeFiles: [], afterFiles: [], scanner: { findings: [] } });
  }
  const config = parseQualityConfig(stagedConfig(root, snapshot));
  const before = extractFactInventory(readSourceInventory(root, "HEAD"), affected);
  const after = extractFactInventory(readSourceInventory(root, "index"), affected);
  return decideQuality({
    snapshot,
    config,
    beforeFiles: before.files,
    afterFiles: after.files,
    analysisErrors: [...before.errors, ...after.errors],
    scanner: scannerEvidence(root),
  });
}

export function runCheckCommand(args: string[], root = process.cwd()): CommandResult {
  const options = parseCheckArguments(args);
  if ("exitCode" in options) return options;
  try {
    const result = runStagedCheck(root, options);
    return { exitCode: exitCodeFor(result), output: renderDecision(result, options.json) };
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
}

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parseQualityConfig } from "./config.js";
import { appendArchitectureAcknowledgement, parseArchitectureAcknowledgements } from "./acknowledgements.js";
import { decideQuality, type ScannerEvidence } from "./decision-core.js";
import { extractFactInventory } from "./facts.js";
import { DECISION_RECORD_PATH } from "./fingerprint.js";
import { parseResponsibilityMap } from "./responsibility-map.js";
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

export interface AcknowledgeOptions {
  findingId: string;
  reason: string;
  author: string;
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

/** Parses the public acknowledgement command. Its fields become tracked review evidence. */
export function parseAcknowledgeArguments(args: string[]): AcknowledgeOptions | CommandResult {
  if (args[0] !== "acknowledge") return acknowledgeUsage();
  let findingId: string | undefined;
  let reason: string | undefined;
  let author: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const value = arg.startsWith("--finding=") ? arg.slice("--finding=".length) : arg.startsWith("--reason=") ? arg.slice("--reason=".length) : arg.startsWith("--author=") ? arg.slice("--author=".length) : args[++index];
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
  for (const finding of result.findings) lines.push(`${finding.severity.toUpperCase()}: ${finding.reason} (${finding.id})`);
  for (const findingId of result.staleAcknowledgements ?? []) lines.push(`STALE: acknowledgement for ${findingId} does not match the current staged fingerprint`);
  if (result.refactorProgress) {
    for (const [name, indicator] of Object.entries(result.refactorProgress.indicators)) {
      lines.push(`REFACTOR: ${name} ${indicator.status} (${indicator.before} -> ${indicator.after})`);
    }
  }
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

function readIndexFile(root: string, filePath: string, fallback?: string): string {
  try {
    return execFileSync("git", ["show", `:${filePath}`], { cwd: root, encoding: "utf8" });
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error(`${filePath} is not present in the staged index`);
  }
}

/** Runs the index-only staged decision, including tracked review and refactor evidence. */
export function runStagedCheck(root: string, options: CheckOptions): DecisionResult {
  const snapshot = readStagedSnapshot(root);
  const refactorMap = options.intent === "refactor" && options.target ? parseResponsibilityMap(readIndexFile(root, options.target)) : undefined;
  const affected = snapshot.changes.flatMap((change) => [change.before?.path, change.after?.path]).filter((filePath): filePath is string => Boolean(filePath));
  if (!affected.some(isSourceOrConfiguration)) {
    return decideQuality({ snapshot, config: parseQualityConfig("{}"), beforeFiles: [], afterFiles: [], scanner: { findings: [] } });
  }
  const config = parseQualityConfig(stagedConfig(root, snapshot));
  const before = extractFactInventory(readSourceInventory(root, "HEAD"), affected);
  const after = extractFactInventory(readSourceInventory(root, "index"), affected);
  const acknowledgementRecords = parseArchitectureAcknowledgements(readIndexFile(root, DECISION_RECORD_PATH, "[]"));
  return decideQuality({
    snapshot,
    config,
    beforeFiles: before.files,
    afterFiles: after.files,
    analysisErrors: [...before.errors, ...after.errors],
    scanner: scannerEvidence(root),
    acknowledgementRecords,
    refactorMap,
  });
}

function runAcknowledgeCommand(args: string[], root: string): CommandResult {
  const options = parseAcknowledgeArguments(args);
  if ("exitCode" in options) return options;
  try {
    const decision = runStagedCheck(root, { json: false, intent: "change" });
    const finding = decision.findings.find((item) => item.id === options.findingId);
    if (!finding) return acknowledgeUsage(`unknown or stale finding ${options.findingId}`);
    if (finding.severity !== "review") return acknowledgeUsage(`finding ${options.findingId} is deterministic and cannot be acknowledged`);
    if (!decision.fingerprint) return acknowledgeUsage("no current staged source fingerprint is available");
    const recordPath = path.join(root, DECISION_RECORD_PATH);
    let source = "[]";
    try {
      source = readFileSync(recordPath, "utf8");
    } catch {
      // A newly introduced tracked record begins as an empty array.
    }
    mkdirSync(path.dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, appendArchitectureAcknowledgement(source, { ...options, fingerprint: decision.fingerprint, time: new Date().toISOString() }), "utf8");
    execFileSync("git", ["add", "--", DECISION_RECORD_PATH], { cwd: root, stdio: "ignore" });
    return { exitCode: 0, output: `Acknowledged review finding ${options.findingId}` };
  } catch (error) {
    return acknowledgeUsage(error instanceof Error ? error.message : String(error));
  }
}

export function runCheckCommand(args: string[], root = process.cwd()): CommandResult {
  if (args[0] === "acknowledge") return runAcknowledgeCommand(args, root);
  const options = parseCheckArguments(args);
  if ("exitCode" in options) return options;
  try {
    const result = runStagedCheck(root, options);
    return { exitCode: exitCodeFor(result), output: renderDecision(result, options.json) };
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
}

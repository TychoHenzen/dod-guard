import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFailure } from "./scanner-failure.js";

const SCAN_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 32 * 1024 * 1024;

export interface ScanRequest {
  paths: string[];
  root?: string;
  rules?: string[];
  excludes?: string[];
  testPaths?: string[];
  profile?: "default" | "strict";
  baseline?: string;
  writeBaseline?: string;
  failOn?: "none" | "error" | "regression" | "any";
}

/** Absolute path to the scanner that ships beside this server. */
function scannerPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(
    here,
    "..",
    "skills",
    "quality-refactor",
    "scripts",
    "quality-scan.mjs",
  );
}

function buildArgs(request: ScanRequest): string[] {
  return [
    ...request.paths,
    "--format=json",
    ...optionalArgs(request),
    ...repeatedArgs("--exclude", request.excludes),
    ...repeatedArgs("--test-path", request.testPaths),
  ];
}

function optionalArgs(request: ScanRequest): string[] {
  return [
    flag("--root", request.root),
    flag("--profile", request.profile),
    flag(
      "--rules",
      request.rules?.length ? request.rules.join(",") : undefined,
    ),
    flag("--baseline", request.baseline),
    flag("--write-baseline", request.writeBaseline),
    flag("--fail-on", request.failOn),
  ].filter((value): value is string => value !== undefined);
}

function flag(name: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${name}=${value}`;
}

function repeatedArgs(name: string, values: string[] | undefined): string[] {
  return (values ?? []).map((value) => `${name}=${value}`);
}

/**
 * Run the scanner. A non-zero exit is a gate verdict, not a crash, so the exit
 * code is returned rather than thrown. Exit 3 means the scanner rejected the
 * request itself.
 */
export function runScan(request: ScanRequest, run = execFileSync) {
  const args = [scannerPath(), ...buildArgs(request)];
  try {
    const stdout = run(process.execPath, args, {
      encoding: "utf8",
      timeout: SCAN_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      cwd: request.root,
    }) as string;
    return { exitCode: 0, report: JSON.parse(stdout) };
  } catch (err) {
    return scanFailure(err);
  }
}

/**
 * Thin wrapper around the quality-refactor scanner.
 *
 * The scanner is a zero-dependency `.mjs` script that ships in the skill. It
 * stays the single implementation. This module only builds its argument list
 * and parses its output. The MCP tools, the hook and the CI ratchet therefore
 * all measure the same way.
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

export interface ScanResult {
  exitCode: number;
  report: unknown;
}

/** Absolute path to the scanner that ships beside this server. */
export function scannerPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "skills", "quality-refactor", "scripts", "quality-scan.mjs");
}

export function buildArgs(request: ScanRequest): string[] {
  const args = [...request.paths, "--format=json"];
  if (request.root) args.push(`--root=${request.root}`);
  if (request.profile) args.push(`--profile=${request.profile}`);
  if (request.rules?.length) args.push(`--rules=${request.rules.join(",")}`);
  for (const exclude of request.excludes ?? []) args.push(`--exclude=${exclude}`);
  for (const testPath of request.testPaths ?? []) args.push(`--test-path=${testPath}`);
  if (request.baseline) args.push(`--baseline=${request.baseline}`);
  if (request.writeBaseline) args.push(`--write-baseline=${request.writeBaseline}`);
  if (request.failOn) args.push(`--fail-on=${request.failOn}`);
  return args;
}

/**
 * Run the scanner. A non-zero exit is a gate verdict, not a crash, so the exit
 * code is returned rather than thrown. Exit 3 means the scanner rejected the
 * request itself.
 */
export function runScan(request: ScanRequest, run = execFileSync): ScanResult {
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
    const failure = err as { status?: number; stdout?: string; message?: string };
    if (typeof failure.stdout === "string" && failure.stdout.trim()) {
      return { exitCode: failure.status ?? 1, report: JSON.parse(failure.stdout) };
    }
    throw new Error(`quality scan failed: ${failure.message ?? String(err)}`);
  }
}

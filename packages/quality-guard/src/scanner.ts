import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { asyncExecFile, scanFailure } from "./scanner-failure.js";

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

const SCAN_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 32 * 1024 * 1024;

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
  const optional = [
    request.root === undefined ? undefined : `--root=${request.root}`,
    request.profile === undefined ? undefined : `--profile=${request.profile}`,
    request.rules?.length ? `--rules=${request.rules.join(",")}` : undefined,
    request.baseline === undefined
      ? undefined
      : `--baseline=${request.baseline}`,
    request.writeBaseline === undefined
      ? undefined
      : `--write-baseline=${request.writeBaseline}`,
    request.failOn === undefined ? undefined : `--fail-on=${request.failOn}`,
  ].filter((value): value is string => value !== undefined);
  return [
    ...request.paths,
    "--format=json",
    ...optional,
    ...(request.excludes ?? []).map((value) => `--exclude=${value}`),
    ...(request.testPaths ?? []).map((value) => `--test-path=${value}`),
  ];
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

export async function runScanAsync(request: ScanRequest, run = asyncExecFile) {
  const args = [scannerPath(), ...buildArgs(request)];
  try {
    const { stdout } = await run(process.execPath, args, {
      encoding: "utf8",
      timeout: SCAN_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      cwd: request.root,
    });
    return { exitCode: 0, report: JSON.parse(stdout) };
  } catch (err) {
    return scanFailure(err);
  }
}

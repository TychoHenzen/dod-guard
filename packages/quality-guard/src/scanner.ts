import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFailure } from "./scanner-failure.js";
import { asyncExecFile } from "./scanner-execution.js";
import { buildArgs, type ScanRequest } from "./scanner-request.js";

export type { ScanRequest } from "./scanner-request.js";

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

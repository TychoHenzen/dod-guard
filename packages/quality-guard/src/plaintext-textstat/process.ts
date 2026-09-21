import { type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerResponse } from "../plaintext-textstat-provider.js";
import { isolatedEnvironment } from "./environment.js";
import type { TextstatResult } from "../plaintext-textstat-result.js";
import type { Spawn } from "./spawn.js";

const TEXTSTAT_TIMEOUT_MS = 2_000;

function textOf(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function invoke(input: {
  text: string;
  command: string;
  args: string[];
  spawn: Spawn;
}, workdir?: string): SpawnSyncReturns<string> {
  return input.spawn(input.command, input.args, {
    encoding: "utf8",
    input: input.text,
    timeout: TEXTSTAT_TIMEOUT_MS,
    windowsHide: true,
    ...(workdir ? { cwd: workdir, env: isolatedEnvironment(workdir) } : {}),
  });
}

function invokeIsolated(input: {
  text: string;
  command: string;
  args: string[];
  spawn: Spawn;
}): SpawnSyncReturns<string> | TextstatResult {
  const workdir = mkdtempSync(join(tmpdir(), "quality-guard-textstat-"));
  try {
    return invoke({ ...input, args: ["-I", ...input.args] }, workdir);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `textstat could not start: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function invokeTextstat(input: {
  text: string;
  command: string;
  args: string[];
  spawn: Spawn;
  isolated: boolean;
}): SpawnSyncReturns<string> | TextstatResult {
  if (!input.isolated) return invoke(input);
  return invokeIsolated(input);
}

function successResult(result: SpawnSyncReturns<string>): TextstatResult | null {
  if (result.error || result.status !== 0) return null;
  return providerResponse(textOf(result.stdout));
}

function failureResult(result: SpawnSyncReturns<string>): TextstatResult {
  const detail = textOf(result.stderr).trim() || result.error?.message;
  return {
    status: "unavailable",
    reason: detail
      ? `textstat failed: ${detail.slice(0, 300)}`
      : `textstat exited with code ${result.status ?? "unknown"}`,
  };
}

function processResult(result: SpawnSyncReturns<string>): TextstatResult {
  return successResult(result) ?? failureResult(result);
}

function isUnavailable(value: unknown): value is TextstatResult {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { status?: unknown }).status === "unavailable"
  );
}

export function executeTextstat(input: {
  text: string;
  command: string;
  args: string[];
  spawn: Spawn;
  isolated: boolean;
}): TextstatResult {
  const result = invokeTextstat(input);
  return isUnavailable(result) ? result : processResult(result);
}

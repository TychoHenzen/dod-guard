/**
 * Multi-gate verification runner.
 *
 * Runs a sequence of gates (lint → build → test → verify) in cheapest-first
 * order with short-circuit on first failure. Provides structured diagnostic
 * parsing for TypeScript, ESLint, and Biome output formats.
 *
 * Import types from ./types.js only.
 */

import { execSync } from "node:child_process";
import type { GateResult, Diagnostic, OracleResult } from "./types.js";

// ── Gate config ───────────────────────────────────────────────────────

export interface GateConfig {
  build_cmd?: string;
  test_cmd?: string;
  lint_cmd?: string;
  verify_cmd?: string;
}

// ── GateRunner ────────────────────────────────────────────────────────

/**
 * Runs shell-command gates in cheapest-first order, short-circuiting on
 * the first failure. Each gate is verified by exit code (0 = pass).
 */
export class GateRunner {
  private config: GateConfig;
  private timeoutMs: number;

  constructor(config: GateConfig, timeoutMs = 120_000) {
    this.config = config;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Run all configured gates in order: lint → build → test → verify.
   * Returns results for gates that were actually run — skipped if no cmd
   * configured. Short-circuits on the first non-zero exit.
   */
  async runAll(cwd: string): Promise<GateResult[]> {
    const ordered: { name: string; cmd: string | undefined }[] = [
      { name: "lint", cmd: this.config.lint_cmd },
      { name: "build", cmd: this.config.build_cmd },
      { name: "test", cmd: this.config.test_cmd },
      { name: "verify", cmd: this.config.verify_cmd },
    ];

    const results: GateResult[] = [];

    for (const gate of ordered) {
      if (!gate.cmd) continue;

      const result = this.execGate(gate.name, gate.cmd, cwd);
      results.push(result);
      if (!result.passed) break;
    }

    return results;
  }

  /**
   * Execute a single gate command via execSync.
   * Mirrors the runCommand pattern from agent.ts.
   */
  private execGate(name: string, cmd: string, cwd: string): GateResult {
    const t0 = Date.now();

    try {
      execSync(cmd, {
        cwd,
        encoding: "utf-8",
        timeout: this.timeoutMs,
        stdio: "pipe",
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        gate: name,
        passed: true,
        diagnostics: "",
        elapsed_ms: Date.now() - t0,
      };
    } catch (err: unknown) {
      const e = err as {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        status?: number;
        code?: string;
      };
      const stdout = e.stdout ? String(e.stdout) : "";
      const stderr = e.stderr ? String(e.stderr) : "";
      const combined = `${stdout}\n${stderr}`.trim();
      return {
        gate: name,
        passed: false,
        diagnostics: combined.slice(0, 10000),
        elapsed_ms: Date.now() - t0,
      };
    }
  }
}

// ── Diagnostic parsing ────────────────────────────────────────────────

/**
 * Parse structured diagnostics from compiler/linter output.
 *
 * Handles three common output formats:
 *   TypeScript:  file.ts(line,col): error TS1234: message
 *   ESLint:      path/file.js:line:col: error/warning message
 *   Biome:       path/file.ts:line:col error/warning/info message
 *
 * Falls back to a single raw diagnostic entry when no lines match any
 * known format but output exists.
 *
 * @returns Up to 50 parsed Diagnostic entries.
 */
export function parseDiagnostics(output: string, _gateType: string): Diagnostic[] {
  if (!output || !output.trim()) return [];

  const diagnostics: Diagnostic[] = [];
  const lines = output.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let match: RegExpExecArray | null;

    // TypeScript:   /path/file.ts(42,10): error TS2345: message
    const tsRe =
      /^(.+?)\((\d+),\d+\):\s+(error|warning)\s+TS\d+:\s+(.+)$/;
    match = tsRe.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: Number.parseInt(match[2], 10),
        severity: match[3] as "error" | "warning",
        message: match[4],
        context: "",
      });
      if (diagnostics.length >= 50) break;
      continue;
    }

    // ESLint:       path/file.js:10:5: error "no-unused-vars"  message
    //               path/file.js:10:5: warning "no-console"  message
    const eslintRe =
      /^([^:]+):(\d+):(\d+):\s+(error|warning)\s+(.+)$/;
    match = eslintRe.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: Number.parseInt(match[2], 10),
        severity: match[4] as "error" | "warning",
        message: match[5],
        context: "",
      });
      if (diagnostics.length >= 50) break;
      continue;
    }

    // Biome:        path/file.ts:10:5 error[noUnusedVariables] message
    //               path/file.ts:10:5 warning/lint/syntaxError message
    const biomeRe =
      /^([^:]+):(\d+):(\d+)\s+(error|warning|info)\s+(.+)$/;
    match = biomeRe.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: Number.parseInt(match[2], 10),
        severity: match[4] as "error" | "warning" | "info",
        message: match[5],
        context: "",
      });
      if (diagnostics.length >= 50) break;
    }
  }

  // Fallback: no lines matched known formats but output exists
  if (diagnostics.length === 0) {
    diagnostics.push({
      file: "",
      line: 0,
      severity: "error",
      message: output.slice(0, 2000),
      context: "",
    });
  }

  return diagnostics;
}

// ── Oracle result aggregation ─────────────────────────────────────────

/**
 * Aggregate a set of `GateResult`s into a single `OracleResult`.
 *
 * - `pass`: true only when EVERY gate passed.
 * - `score`: fraction of gates that passed (0.0 – 1.0).
 * - `diagnostics`: structured diagnostics from every failed gate.
 * - `elapsed_ms`: sum of all gate durations.
 * - `oracle_type`: forwarded from the caller.
 */
export function toOracleResult(
  gateResults: GateResult[],
  oracleType: string,
): OracleResult {
  const totalGates = gateResults.length;
  const passedGates = gateResults.filter((r) => r.passed).length;

  const allPassed = totalGates > 0 && passedGates === totalGates;
  const score = totalGates > 0 ? passedGates / totalGates : 1.0;

  const diagnostics: Diagnostic[] = [];
  for (const r of gateResults) {
    if (!r.passed && r.diagnostics) {
      const parsed = parseDiagnostics(r.diagnostics, r.gate);
      diagnostics.push(...parsed);
    }
  }

  const elapsed_ms = gateResults.reduce((sum, r) => sum + r.elapsed_ms, 0);

  return {
    pass: allPassed,
    score,
    diagnostics,
    elapsed_ms,
    oracle_type: oracleType,
  };
}

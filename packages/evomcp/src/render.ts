/**
 * Pure text formatters for the MCP tool results. No I/O, no network, no
 * subprocess. Every field that can be missing or oversized routes through
 * one of `field`, `formatStats`, or `formatLineageDiagnostics` so the rule
 * is written once and applied everywhere it is needed.
 */

import type { OrchestrateResult } from "./orchestrate.js";
import type { EscalationReport, EvolveResult, LineageDiagnostic, RunStats, SolveResult } from "./types.js";

const NA = "N/A";
const FIELD_LIMIT = 8000;

function truncate(text: string): string {
  if (text.length <= FIELD_LIMIT) return text;
  return `${text.slice(0, FIELD_LIMIT)}\n... [truncated, ${text.length} chars total]`;
}

function field(label: string, value: string | undefined, placeholder: string): string {
  const text = value === undefined ? placeholder : truncate(value);
  return `${label}: ${text}`;
}

function formatTokens(tokens: number): string {
  if (tokens < 0) return `Tokens: ${NA}`;
  return `Tokens: ${tokens} (approximate)`;
}

function formatDuration(ms: number): string {
  return `Duration: ${(ms / 1000).toFixed(1)}s`;
}

function formatStats(stats: RunStats): string {
  return [
    "## Stats",
    `Plans sampled: ${stats.plans_sampled}`,
    `Candidates generated: ${stats.candidates_generated}`,
    formatTokens(stats.tokens_consumed),
    formatDuration(stats.duration_ms),
    `Model: ${stats.model}`,
  ].join("\n");
}

function formatDegenerate(rejections: string[] | undefined): string {
  if (!rejections || rejections.length === 0) return "";
  return `Degenerate rejections: ${rejections.length}`;
}

function verifyExitLine(code: number | undefined): string {
  return code === undefined ? `verify_exit=${NA}` : `verify_exit=${code}`;
}

function statusMarkers(d: LineageDiagnostic): string[] {
  if (d.final_status === "no_output") {
    return [`NO OUTPUT (claude_exit_code=${d.claude_exit_code})`, "Hint: check the proxy or API key."];
  }
  if (d.final_status === "timed_out") {
    return ["TIMED OUT", "Hint: increase timeout to avoid recurring stalls."];
  }
  return [];
}

// A timed out or silent round ran no verification, so any exit code on the
// diagnostic came from an earlier round. Showing it beside the marker reads as
// the result of the round that actually failed, so it stays out.
function verifyExitLines(d: LineageDiagnostic): string[] {
  if (d.final_status === "timed_out" || d.final_status === "no_output") return [];
  return [verifyExitLine(d.verify_exit_code)];
}

function formatDiagnostic(d: LineageDiagnostic): string {
  return [
    `Lineage: ${d.lineage_id} (${d.strategy})`,
    `Repair attempts: ${d.repair_attempts}`,
    ...verifyExitLines(d),
    ...statusMarkers(d),
  ].join("\n");
}

function formatLineageDiagnostics(diags: LineageDiagnostic[] | undefined): string {
  if (!diags || diags.length === 0) return "";
  return ["## Lineage Diagnostics", ...diags.map(formatDiagnostic)].join("\n\n");
}

function formatEscalation(esc: EscalationReport): string {
  const lines = [
    `Failure signature: ${esc.failure_signature}`,
    `Summary: ${esc.summary}`,
    `Lineages attempted: ${esc.lineages_attempted}`,
    field("Best output", esc.best_output, "(no patch)"),
  ];
  const diagnostics = formatLineageDiagnostics(esc.lineage_diagnostics);
  if (diagnostics) lines.push(diagnostics);
  return lines.join("\n\n");
}

function formatSolvePass(result: SolveResult): string {
  const lines = [
    "# Solve: PASSED",
    field("Patch", result.patch, "(no patch)"),
    field("Verification Report", result.verification_report, "(no report)"),
  ];
  const degenerate = formatDegenerate(result.degenerate_rejections);
  if (degenerate) lines.push(degenerate);
  lines.push(formatStats(result.stats));
  return lines.join("\n\n");
}

function formatSolveEscalate(result: SolveResult): string {
  const lines = ["# Solve: ESCALATED"];
  if (result.escalation) lines.push(formatEscalation(result.escalation));
  lines.push(formatStats(result.stats));
  return lines.join("\n\n");
}

export function formatSolveResult(result: SolveResult): string {
  return result.outcome === "pass" ? formatSolvePass(result) : formatSolveEscalate(result);
}

function formatPercentage(improvement: number, baseline: number): string {
  if (baseline === 0) return NA;
  return `${((improvement / Math.abs(baseline)) * 100).toFixed(1)}%`;
}

function formatFitnessRow(entry: { generation: number; best_score: number; mean_score: number }): string {
  return `| ${entry.generation} | ${entry.best_score} | ${entry.mean_score} |`;
}

function formatFitnessHistory(history: EvolveResult["fitness_history"]): string {
  if (history.length === 0) return "## Fitness History\n(no generations recorded)";
  return ["## Fitness History", ...history.map(formatFitnessRow)].join("\n");
}

export function formatEvolveResult(result: EvolveResult): string {
  const improvement = result.baseline_score - result.best_score;
  const pct = formatPercentage(improvement, result.baseline_score);
  return [
    "# Evolve: COMPLETE",
    `Improvement: ${improvement.toFixed(1)} (${pct})`,
    field("Best Patch", result.best_patch, "(no patch)"),
    field("Verification Report", result.verification_report, "(no report)"),
    formatFitnessHistory(result.fitness_history),
    formatStats(result.stats),
  ].join("\n\n");
}

function formatNestedSolve(solveResult: SolveResult | undefined): string {
  if (!solveResult || solveResult.outcome !== "pass") return "";
  return [
    "## Solve Patch",
    field("Patch", solveResult.patch, "(no patch)"),
    field("Verification Report", solveResult.verification_report, "(no report)"),
  ].join("\n\n");
}

export function formatOrchestrateResult(result: OrchestrateResult): string {
  const lines = [`# Orchestrate: ${result.outcome.toUpperCase()}`, `Summary: ${result.summary}`];
  const nested = formatNestedSolve(result.solveResult);
  if (nested) lines.push(nested);
  return lines.join("\n\n");
}

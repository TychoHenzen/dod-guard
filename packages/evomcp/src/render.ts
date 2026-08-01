import type { evolve } from "./evolve.js";
import type { orchestrateSolve } from "./orchestrate.js";
import type { solve } from "./solve.js";

// ── Formatting ─────────────────────────────────────────────────────────

export function formatSolveResult(result: Awaited<ReturnType<typeof solve>>): string {
  if (result.outcome === "pass") {
    return [
      "## Solve: PASSED",
      "",
      "### Patch",
      "```",
      result.patch?.slice(0, 5000) ?? "(no patch)",
      "```",
      "",
      "### Verification",
      "```",
      result.verification_report?.slice(0, 3000) ?? "(no report)",
      "```",
      "",
      "### Stats",
      `- Plans: ${result.stats.plans_sampled}`,
      `- Candidates: ${result.stats.candidates_generated}`,
      result.degenerate_rejections?.length ? `- Degenerate rejections: ${result.degenerate_rejections.length}` : "",
      `- Tokens: ${result.stats.tokens_consumed >= 0 ? String(result.stats.tokens_consumed) : "N/A (direct)"}`,
      result.stats.tokens_consumed >= 0
        ? "  ⚠ Cost is approximate — proxy counter is global and may include other consumers"
        : "",
      `- Duration: ${(result.stats.duration_ms / 1000).toFixed(1)}s`,
      `- Model: ${result.stats.model}`,
    ].join("\n");
  }

  const diagLines: string[] = [];
  if (result.escalation?.lineage_diagnostics && result.escalation.lineage_diagnostics.length > 0) {
    diagLines.push("### Lineage Diagnostics", "");
    for (const d of result.escalation.lineage_diagnostics) {
      const statusEmoji =
        d.final_status === "passed"
          ? "✅"
          : d.final_status === "failed"
            ? "❌"
            : d.final_status === "stuck"
              ? "🔁"
              : d.final_status === "no_output"
                ? "🤫"
                : "⏱️";
      diagLines.push(
        `| ${statusEmoji} | ${d.lineage_id} | ${d.strategy} | repairs=${d.repair_attempts} | ${d.timed_out ? "TIMED OUT" : d.claude_no_output ? `NO OUTPUT (exit=${d.claude_exit_code})` : `verify_exit=${d.verify_exit_code ?? "N/A"}`} |`,
      );
      if (d.claude_no_output) {
        diagLines.push(`  ⚠️ \`claude -p\` produced NO output — proxy or API key issue?`);
      } else if (d.timed_out) {
        diagLines.push(`  ⚠️ \`claude -p\` timed out — increase timeout or simplify task`);
      }
    }
    diagLines.push("");
  }

  return [
    "## Solve: ESCALATED",
    "",
    "All lineages exhausted. Requires smarter model intervention.",
    "",
    "### Escalation Report",
    `- Lineages attempted: ${result.escalation?.lineages_attempted ?? "(none)"}`,
    `- Failure signature: ${result.escalation?.failure_signature ?? "(none)"}`,
    `- Summary: ${result.escalation?.summary ?? "(none)"}`,
    ...diagLines,
    "### Best Partial Output",
    "```",
    result.escalation?.best_output?.slice(0, 2000) ?? "(none)",
    "```",
    "",
    "### Stats",
    `- Plans: ${result.stats.plans_sampled}`,
    `- Candidates: ${result.stats.candidates_generated}`,
    result.degenerate_rejections?.length ? `- Degenerate rejections: ${result.degenerate_rejections.length}` : "",
    `- Tokens: ${result.stats.tokens_consumed >= 0 ? String(result.stats.tokens_consumed) : "N/A (direct)"}`,
    result.stats.tokens_consumed >= 0
      ? "  ⚠ Cost is approximate — proxy counter is global and may include other consumers"
      : "",
    `- Duration: ${(result.stats.duration_ms / 1000).toFixed(1)}s`,
    `- Model: ${result.stats.model}`,
    "",
    "ACTION: Claude should inspect the failure signature and solve the stuck sub-problem directly, then re-invoke solve with revised context.",
  ].join("\n");
}

export function formatEvolveResult(result: Awaited<ReturnType<typeof evolve>>): string {
  const improvement = result.baseline_score - result.best_score;
  const pct = result.baseline_score !== 0 ? ((improvement / Math.abs(result.baseline_score)) * 100).toFixed(1) : "N/A";

  return [
    "## Evolve: COMPLETE",
    "",
    "### Results",
    `- Baseline: ${result.baseline_score.toFixed(2)}`,
    `- Final: ${result.best_score.toFixed(2)}`,
    `- Improvement: ${improvement.toFixed(2)} (${pct}%)`,
    "",
    "### Fitness History",
    "| Gen | Best | Mean |",
    "|-----|------|------|",
    ...result.fitness_history.map(
      (h) => `| ${h.generation} | ${h.best_score.toFixed(2)} | ${h.mean_score.toFixed(2)} |`,
    ),
    "",
    "### Best Patch",
    "```diff",
    result.best_patch.slice(0, 5000),
    "```",
    "",
    "### Verification",
    "```",
    result.verification_report.slice(0, 3000),
    "```",
    "",
    "### Stats",
    `- Candidates: ${result.stats.candidates_generated}`,
    `- Tokens: ${result.stats.tokens_consumed >= 0 ? String(result.stats.tokens_consumed) : "N/A (direct)"}`,
    result.stats.tokens_consumed >= 0
      ? "  ⚠ Cost is approximate — proxy counter is global and may include other consumers"
      : "",
    `- Duration: ${(result.stats.duration_ms / 1000).toFixed(1)}s`,
    `- Model: ${result.stats.model}`,
  ].join("\n");
}

// ── Formatting ─────────────────────────────────────────────────────────

export function formatOrchestrateResult(result: Awaited<ReturnType<typeof orchestrateSolve>>): string {
  return [
    `## Orchestrate: ${result.outcome.toUpperCase()}`,
    "",
    result.summary,
    "",
    ...(result.solveResult && result.solveResult.outcome === "pass"
      ? [
          "### Solve Patch",
          "```",
          result.solveResult.patch?.slice(0, 2000) ?? "(no patch)",
          "```",
          "",
          "### Verification",
          "```",
          result.solveResult.verification_report?.slice(0, 1000) ?? "(no report)",
          "```",
        ]
      : []),
  ].join("\n");
}

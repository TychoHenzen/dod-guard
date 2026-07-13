import type { CheckResult } from "./types.js";

export function formatCheckResult(result: CheckResult): string {
  console.debug("format-result: formatCheckResult", { overall: result.overall });
  const l: string[] = [];
  l.push(`## DoD Check Result: ${result.overall.toUpperCase()}`);
  l.push("");

  if (result.tampered) {
    l.push("🔴 **TAMPER DETECTED** — proof-set fingerprint mismatch. Store was edited outside dod_amend.");
    l.push("");
  }

  if (result.blocked_by_manuals) {
    l.push("⛔ **BLOCKED: Manual verification required.** All automated proofs pass, but this DoD is NOT complete.");
    l.push(
      `   ${result.manual_unverified} manual/review proof(s) await dod_verify. Call dod_verify for each, then re-run dod_check.`,
    );
    l.push(
      "   Do NOT report done until manuals are verified — the fix may look correct to proofs but be visually wrong.",
    );
    l.push("");
  }

  if (result.scoped) {
    l.push(
      `⏳ **Scoped run — node "${result.ran_node_path}" only.** Other nodes shown from their last check, not re-run.`,
    );
    l.push("This is NOT a completion verdict. Run `dod_check` with no `nodePath` to verify the whole DoD.");
    l.push("");
  }

  if (result.draft_count > 0) {
    l.push(
      `📝 **${result.draft_count} draft node(s)** — use dod_refine to concretize before a final pass is possible.`,
    );
    l.push("");
  }

  if (result.amendment_warnings.length > 0) {
    l.push("⚠️ **Amendment cycle warnings:** These proofs have been amended 3+ times — possible proof-tuning:");
    for (const w of result.amendment_warnings) {
      l.push(`   • "${w.title}" — ${w.count} amendments`);
    }
    l.push("   Verify these proofs still test the right thing, not just whatever the code happens to do.");
    l.push("");
  }

  // Group leaves by root-level path prefix for hierarchical display
  const byRoot = new Map<string, typeof result.leaves>();
  for (const leaf of result.leaves) {
    const rootIdx = leaf.node_path.split(".")[0];
    if (!byRoot.has(rootIdx)) byRoot.set(rootIdx, []);
    byRoot.get(rootIdx)?.push(leaf);
  }

  const summaryMode = result.summary_mode === true;

  for (const [rootIdx, leaves] of byRoot) {
    const passCount = leaves.filter((p) => p.status === "pass").length;
    const failCount = leaves.filter((p) => p.status === "fail").length;
    const skipCount = leaves.filter((p) => p.status === "skipped").length;
    const draftCount = leaves.filter((p) => p.status === "draft").length;
    const hasFail = failCount > 0;
    const hasDraft = draftCount > 0;
    const icon = hasFail ? "❌" : hasDraft ? "📝" : "✅";
    const status = hasFail ? "FAIL" : hasDraft ? "INCOMPLETE" : "PASS";
    const rootTitle = leaves[0]?.title ?? `Root ${rootIdx}`;
    const countStr = [
      passCount > 0 ? `${passCount} pass` : "",
      failCount > 0 ? `${failCount} fail` : "",
      skipCount > 0 ? `${skipCount} skipped` : "",
      draftCount > 0 ? `${draftCount} draft` : "",
    ]
      .filter(Boolean)
      .join(", ");

    l.push(`${icon} **${rootTitle}** — ${status} (${countStr})`);

    for (const leaf of leaves) {
      const depth = leaf.node_path.split(".children.").length - 1;
      const indent = "  ".repeat(depth + 1);

      if (leaf.status === "draft") {
        // Summary mode: collapse all drafts to a single count line per root
        if (summaryMode) continue; // drafts handled by collapsed line below
        l.push(`${indent}📝 ${leaf.description} — DRAFT (use dod_refine to concretize)`);
      } else if (leaf.status === "pass") {
        const isManual = leaf.command === "manual";
        if (isManual) {
          l.push(`${indent}✓ MANUAL — ${leaf.description} (${leaf.output ?? "human-confirmed"})`);
        } else {
          l.push(`${indent}✓ \`${leaf.command}\` (${leaf.duration_ms ?? 0}ms)`);
        }
      } else if (leaf.status === "skipped") {
        l.push(`${indent}⏳ \`${leaf.command}\` — not verified this run${leaf.output ? `: ${leaf.output}` : ""}`);
      } else {
        const isManual = leaf.command === "manual";
        if (isManual) {
          l.push(`${indent}✗ MANUAL — ${leaf.description}`);
          if (leaf.error) l.push(`${indent}  ${leaf.error}`);
        } else {
          l.push(`${indent}✗ \`${leaf.command}\``);
          if (leaf.exit_code !== undefined) l.push(`${indent}  exit code: ${leaf.exit_code}`);
          if (leaf.error) l.push(`${indent}  stderr: ${leaf.error.split("\n").slice(0, 5).join(`\n${indent}  `)}`);
          if (leaf.output) l.push(`${indent}  output: ${leaf.output.split("\n").slice(0, 5).join(`\n${indent}  `)}`);
        }
      }
    }

    // Summary mode: add collapsed draft count after concrete results
    if (summaryMode && draftCount > 0) {
      l.push(`  📝 ${draftCount} draft node(s) unchanged — use dod_refine to concretize`);
    }

    l.push("");
  }

  l.push(`**Summary:** ${result.summary}`);
  l.push(`**Timestamp:** ${result.timestamp}`);
  l.push(`**Proof fingerprint:** \`${result.proof_fingerprint}\``);

  return l.join("\n");
}

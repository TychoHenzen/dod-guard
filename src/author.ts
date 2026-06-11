import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { DodDocument, CheckResult } from "./types.js";

function proofMark(status: string): string {
  switch (status) {
    case "pass": return "[x]";
    case "skipped": return "[~]";
    default: return "[ ]";
  }
}

export function renderMarkdown(doc: DodDocument): string {
  const l: string[] = [];

  l.push(`# ${doc.title} — Requirements Spec`);
  l.push("");
  l.push("> **For Claude (/goal):** Work through each incomplete step below.");
  l.push("> 1. Mark a step `[>]` when you begin working on it.");
  l.push("> 2. Call `dod_check` to verify proofs — do NOT mark proofs manually.");
  l.push("> 3. A step is complete when ALL its proofs pass via `dod_check`.");
  l.push("> 4. If a proof cannot be met, use `dod_amend` to modify it with a reason.");
  l.push("> 5. Continue until `dod_check` returns PASS — then stop and report done.");
  l.push(">");
  l.push(`> **Self-contained.** All commands run from \`${doc.cwd}\` unless noted.`);
  l.push(">");
  l.push("> **🔒 Anti-cheat:** Proofs are stored canonically in MCP storage (dod-guard).");
  l.push("> `dod_check` executes commands from the canonical copy, not this markdown file.");
  l.push("> Editing proof text here has no effect on verification.");
  l.push("> Store tampering is **logged and detectable** — each check prints a proof-set fingerprint.");
  l.push("");
  l.push(`**Goal:** ${doc.goal}`);
  l.push("");
  l.push(`**Date:** ${doc.date}`);
  l.push(`**Target:** \`${doc.cwd}\``);
  l.push(`**DoD ID:** \`${doc.id}\``);

  if (doc.last_check) {
    l.push(`**Last check:** ${doc.last_check.overall.toUpperCase()} (${doc.last_check.timestamp})`);
  }

  l.push("");
  l.push("---");

  if (doc.sections.decisions) {
    l.push("");
    l.push("## Decisions (locked with user)");
    l.push("");
    l.push(doc.sections.decisions);
  }

  if (doc.sections.current_state) {
    l.push("");
    l.push("## Current state");
    l.push("");
    l.push(doc.sections.current_state);
  }

  l.push("");
  l.push("## Requirements");
  l.push("");
  l.push(doc.sections.requirements);

  if (doc.sections.research_notes) {
    l.push("");
    l.push("## Research Notes");
    l.push("");
    l.push(doc.sections.research_notes);
  }

  if (doc.sections.open_questions) {
    l.push("");
    l.push("## Open Questions");
    l.push("");
    l.push(doc.sections.open_questions);
  }

  l.push("");
  l.push("---");
  l.push("");
  l.push("## Definition of Done");

  for (let i = 0; i < doc.steps.length; i++) {
    const step = doc.steps[i];
    const allPass = step.proofs.every(p => p.last_status === "pass" || p.last_status === "skipped");
    const stepMark = allPass && step.proofs.length > 0 ? "[x]" : "[ ]";
    l.push("");
    l.push(`### Step ${i + 1}: ${step.title} ${stepMark}`);
    l.push("");
    for (const proof of step.proofs) {
      const mark = proofMark(proof.last_status);
      if (proof.predicate.type === "manual") {
        l.push(`- ${mark} Proof: Manual — ${proof.description}`);
      } else {
        l.push(`- ${mark} Proof: \`${proof.command}\` → ${proof.description}`);
      }
    }
  }

  if (doc.sections.open_risks) {
    l.push("");
    l.push("## Open risks");
    l.push("");
    l.push(doc.sections.open_risks);
  }

  if (doc.amendments.length > 0) {
    l.push("");
    l.push("## Amendment log");
    l.push("");
    for (const a of doc.amendments) {
      l.push(`- **${a.timestamp}** [${a.step_id}/${a.proof_id}] ${a.action}: ${a.reason}`);
    }
  }

  l.push("");
  return l.join("\n");
}

export async function writeMarkdown(doc: DodDocument): Promise<void> {
  const content = renderMarkdown(doc);
  const dir = path.dirname(doc.markdown_path);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(doc.markdown_path, content, "utf-8");
}

export function updateDocFromCheckResult(doc: DodDocument, result: CheckResult): void {
  for (const stepResult of result.steps) {
    const step = doc.steps.find(s => s.id === stepResult.id);
    if (!step) continue;
    for (const proofResult of stepResult.proofs) {
      const proof = step.proofs.find(p => p.id === proofResult.id);
      if (!proof) continue;
      proof.last_status = proofResult.status;
      proof.last_output = proofResult.output;
      proof.last_checked = result.timestamp;
    }
  }
  doc.last_check = {
    timestamp: result.timestamp,
    overall: result.overall,
    summary: result.summary,
  };
}

export function formatCheckResult(result: CheckResult): string {
  const l: string[] = [];
  l.push(`## DoD Check Result: ${result.overall.toUpperCase()}`);
  l.push("");

  for (const step of result.steps) {
    const passCount = step.proofs.filter(p => p.status === "pass").length;
    const skipCount = step.proofs.filter(p => p.status === "skipped").length;
    const icon = step.status === "pass" ? "✅" : "❌";
    const countStr = skipCount > 0
      ? `${passCount} pass, ${skipCount} manual-skip, ${step.proofs.length - passCount - skipCount} fail`
      : `${passCount}/${step.proofs.length} proofs`;
    l.push(`${icon} **Step: ${step.title}** — ${step.status.toUpperCase()} (${countStr})`);

    for (const proof of step.proofs) {
      if (proof.status === "pass") {
        l.push(`  ✓ \`${proof.command}\` (${proof.duration_ms ?? 0}ms)`);
      } else if (proof.status === "skipped") {
        l.push(`  ⚠ \`${proof.command}\` (MANUAL — not machine-verified, skipped)`);
      } else {
        l.push(`  ✗ \`${proof.command}\``);
        if (proof.exit_code !== undefined) {
          l.push(`    exit code: ${proof.exit_code}`);
        }
        if (proof.error) {
          l.push(`    stderr: ${proof.error.split("\n").slice(0, 5).join("\n    ")}`);
        }
        if (proof.output) {
          l.push(`    output: ${proof.output.split("\n").slice(0, 5).join("\n    ")}`);
        }
      }
    }
    l.push("");
  }

  l.push(`**Summary:** ${result.summary}`);
  l.push(`**Timestamp:** ${result.timestamp}`);
  l.push(`**Proof fingerprint:** \`${result.proof_fingerprint}\``);

  return l.join("\n");
}

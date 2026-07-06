import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { DodDocument, CheckResult, TaskNode } from "./types.js";
import { findNodeByPath, hasDraftNodes, isBranchLocked } from "./checker.js";

function proofMark(status: string): string {
  switch (status) {
    case "pass": return "[x]";
    case "skipped": return "[~]";
    case "draft": return "[~]";
    default: return "[ ]";
  }
}

// ── Render helpers ────────────────────────────────────────────────────

/** Render a TaskNode subtree recursively with indentation. */
function renderNode(node: TaskNode, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  const isLeaf = !node.children || node.children.length === 0;

  if (isLeaf) {
    renderLeaf(node, indent, lines);
  } else {
    renderGroup(node, depth, indent, lines);
  }
}

function renderGroup(node: TaskNode, depth: number, indent: string, lines: string[]): void {
  const hasDrafts = hasDraftNodes(node.children!);
  const allPass = isBranchLocked(node.children!)
    && node.children!.every(c => c.refinement === "concrete" && (c.last_status === "pass" || c.last_status === "skipped"))
    // Also check deep
    && allLeavesPass(node.children!);

  let mark: string;
  if (hasDrafts) mark = "[~]";
  else if (allPass && node.children!.length > 0) mark = "[x]";
  else mark = "[ ]";

  lines.push(`${indent}**${node.title}** ${mark}`);
  lines.push("");

  for (const child of node.children!) {
    renderNode(child, depth + 1, lines);
  }
}

function allLeavesPass(nodes: TaskNode[]): boolean {
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      if (!allLeavesPass(n.children)) return false;
    } else if (n.refinement === "concrete") {
      if (n.last_status !== "pass" && n.last_status !== "skipped") return false;
    } else if (n.refinement === "draft") {
      return false;
    }
  }
  return true;
}

function renderLeaf(node: TaskNode, indent: string, lines: string[]): void {
  if (node.refinement === "draft") {
    const mark = proofMark("draft");
    lines.push(`${indent}- ${mark} **Draft**: ${node.intent ?? node.title}`);
    return;
  }

  // Concrete leaf
  const mark = proofMark(node.last_status);

  if (node.predicate?.type === "manual") {
    const mr = node.manual_result;
    const state = mr
      ? ` _(human-confirmed ${mr.answer.toUpperCase()} at ${mr.confirmed_at} via ${mr.channel})_`
      : " _(awaiting human verification)_";
    lines.push(`${indent}- ${mark} Proof: Manual — ${node.description}${state}`);
  } else if (node.predicate?.type === "tdd") {
    const tddState = node.seen_failing
      ? (node.last_status === "pass" ? "🟢 GREEN" : "🔴 RED")
      : "⬜ AWAITING RED";
    lines.push(`${indent}- ${mark} Proof (TDD ${tddState}): \`${node.command}\` → ${node.description}`);
  } else {
    lines.push(`${indent}- ${mark} Proof: \`${node.command}\` → ${node.description}`);
  }
}

// ── Main render ───────────────────────────────────────────────────────

export function renderMarkdown(doc: DodDocument): string {
  const l: string[] = [];

  l.push(`# ${doc.title} — Requirements Spec`);
  l.push("");
  l.push("<claude_instructions>");
  l.push("**For Claude (/goal):** Work through each incomplete task below.");
  l.push("1. Mark a task `[>]` when you begin working on it.");
  l.push("2. Call `dod_check` to verify proofs — do NOT mark proofs manually.");
  l.push("   While iterating on one subtree, pass `nodePath` to verify just that part fast (others are carried, not re-run). A scoped run returns INCOMPLETE, never PASS.");
  l.push("3. A task group is complete when ALL its concrete proofs pass via `dod_check`.");
  l.push("3b. For `manual`/`review` proofs: `dod_check` never auto-prompts — call");
  l.push("    `dod_verify(dod_id, proof_id)` explicitly when verification is actually relevant.");
  l.push("4. Use `dod_refine` to turn a draft leaf into a concrete proof with a command.");
  l.push("4b. Use `dod_add_node` to add new nodes discovered during implementation.");
  l.push("5. If a proof cannot be met, use `dod_amend` to modify it with a reason.");
  l.push("5b. Proof commands run on the HOST OS — write OS-correct commands (no bash on Windows).");
  l.push("6. Continue until `dod_check` returns PASS (zero drafts, all proofs pass) — then stop and report done.");
  l.push("");
  l.push(`**Self-contained.** All commands run from \`${doc.cwd}\` unless noted.`);
  l.push("");
  l.push("**🔒 Anti-cheat:** Proofs are stored canonically in MCP storage (dod-guard).");
  l.push("`dod_check` executes commands from the canonical copy, not this markdown file.");
  l.push("Editing proof text here has no effect on verification.");
  l.push("Store tampering is **logged and detectable** — each check prints a proof-set fingerprint.");
  l.push("Manual/review proofs are confirmed by the human directly (popup / elicitation) via `dod_verify` —");
  l.push("Claude cannot self-confirm them, and an unrequested one holds the DoD at INCOMPLETE, never PASS.");
  l.push("</claude_instructions>");
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

  const pushSection = (heading: string, tag: string, body: string) => {
    l.push("");
    l.push(`## ${heading}`);
    l.push("");
    l.push(`<${tag}>`);
    l.push(body);
    l.push(`</${tag}>`);
  };

  if (doc.sections.decisions) {
    pushSection("Decisions (locked with user)", "decisions", doc.sections.decisions);
  }

  if (doc.sections.current_state) {
    pushSection("Current state", "current_state", doc.sections.current_state);
  }

  pushSection("Requirements", "requirements", doc.sections.requirements);

  if (doc.sections.research_notes) {
    pushSection("Research Notes", "research_notes", doc.sections.research_notes);
  }

  if (doc.sections.open_questions) {
    pushSection("Open Questions", "open_questions", doc.sections.open_questions);
  }

  l.push("");
  l.push("---");
  l.push("");
  l.push("## Definition of Done");
  l.push("");
  l.push("<definition_of_done>");

  for (let i = 0; i < doc.roots.length; i++) {
    const root = doc.roots[i];
    const isLeaf = !root.children || root.children.length === 0;

    if (isLeaf) {
      l.push("");
      renderLeaf(root, "", l);
    } else {
      const hasDrafts = hasDraftNodes(root.children!);
      const allPass = isBranchLocked(root.children!)
        && root.children!.length > 0
        && allLeavesPass(root.children!);

      let mark: string;
      if (hasDrafts) mark = "[~]";
      else if (allPass) mark = "[x]";
      else mark = "[ ]";

      l.push("");
      l.push(`### ${root.title} ${mark}`);
      l.push("");

      for (const child of root.children!) {
        renderNode(child, 1, l);
      }
    }
  }

  l.push("");
  l.push("</definition_of_done>");

  if (doc.sections.open_risks) {
    pushSection("Open risks", "open_risks", doc.sections.open_risks);
  }

  if (doc.amendments.length > 0) {
    l.push("");
    l.push("## Amendment log");
    l.push("");
    for (const a of doc.amendments) {
      l.push(`- **${a.timestamp}** [${a.node_path}] ${a.action}: ${a.reason}`);
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

// ── Update from check result ──────────────────────────────────────────

export function updateDocFromCheckResult(doc: DodDocument, result: CheckResult): void {
  for (const leafResult of result.leaves) {
    // Scoped run: only write back leaves that were actually executed (not carried forward)
    // Carried-forward leaves have draft/skipped status from persisted state.
    const node = findNodeByPath(doc.roots, leafResult.node_path);
    if (!node) continue;

    // Don't clobber a pending proof with "skipped" on scoped runs
    if (result.scoped && leafResult.node_path !== result.ran_node_path
      && !leafResult.node_path.startsWith(result.ran_node_path ?? "")) continue;

    if (leafResult.status !== "draft") {
      node.last_status = leafResult.status as TaskNode["last_status"];
      node.last_output = leafResult.output;
      node.last_checked = result.timestamp;
    }
  }

  // A scoped run is not a completion verdict
  if (result.scoped) return;

  doc.last_check = {
    timestamp: result.timestamp,
    overall: result.overall,
    summary: result.summary,
  };
}

// ── Format check result ───────────────────────────────────────────────

export function formatCheckResult(result: CheckResult): string {
  const l: string[] = [];
  l.push(`## DoD Check Result: ${result.overall.toUpperCase()}`);
  l.push("");

  if (result.tampered) {
    l.push("🔴 **TAMPER DETECTED** — proof-set fingerprint mismatch. Store was edited outside dod_amend.");
    l.push("");
  }

  if (result.scoped) {
    l.push(`⏳ **Scoped run — node "${result.ran_node_path}" only.** Other nodes shown from their last check, not re-run.`);
    l.push("This is NOT a completion verdict. Run `dod_check` with no `nodePath` to verify the whole DoD.");
    l.push("");
  }

  if (result.draft_count > 0) {
    l.push(`📝 **${result.draft_count} draft node(s)** — use dod_refine to concretize before a final pass is possible.`);
    l.push("");
  }

  // Group leaves by root-level path prefix for hierarchical display
  const byRoot = new Map<string, typeof result.leaves>();
  for (const leaf of result.leaves) {
    const rootIdx = leaf.node_path.split(".")[0];
    if (!byRoot.has(rootIdx)) byRoot.set(rootIdx, []);
    byRoot.get(rootIdx)!.push(leaf);
  }

  for (const [rootIdx, leaves] of byRoot) {
    const passCount = leaves.filter(p => p.status === "pass").length;
    const failCount = leaves.filter(p => p.status === "fail").length;
    const skipCount = leaves.filter(p => p.status === "skipped").length;
    const draftCount = leaves.filter(p => p.status === "draft").length;

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
    ].filter(Boolean).join(", ");

    l.push(`${icon} **${rootTitle}** — ${status} (${countStr})`);

    for (const leaf of leaves) {
      const depth = leaf.node_path.split(".children.").length - 1;
      const indent = "  ".repeat(depth + 1);

      if (leaf.status === "draft") {
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
    l.push("");
  }

  l.push(`**Summary:** ${result.summary}`);
  l.push(`**Timestamp:** ${result.timestamp}`);
  l.push(`**Proof fingerprint:** \`${result.proof_fingerprint}\``);

  return l.join("\n");
}

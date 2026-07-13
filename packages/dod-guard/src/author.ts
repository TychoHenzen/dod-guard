import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DEFAULT_BREVITY_OPTS } from "./brevity.js";
import { findNodeByPath, hasDraftNodes, isBranchLocked } from "./checker.js";
import type { CheckResult, DodDocument, TaskNode } from "./types.js";

function proofMark(status: string): string {
  switch (status) {
    case "pass":
      return "[x]";
    case "skipped":
      return "[~]";
    case "draft":
      return "[~]";
    default:
      return "[ ]";
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
  const children = node.children;
  if (!children) return;

  const hasDrafts = hasDraftNodes(children);
  const allPass =
    isBranchLocked(children) &&
    children.every((c) => c.refinement === "concrete" && (c.last_status === "pass" || c.last_status === "skipped")) &&
    // Also check deep
    allLeavesPass(children);

  let mark: string;
  if (hasDrafts) mark = "[~]";
  else if (allPass && children.length > 0) mark = "[x]";
  else mark = "[ ]";

  lines.push(`${indent}**${node.title}** ${mark}`);
  lines.push("");

  for (const child of children) {
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
    const tddState = node.seen_failing ? (node.last_status === "pass" ? "🟢 GREEN" : "🔴 RED") : "⬜ AWAITING RED";
    lines.push(`${indent}- ${mark} Proof (TDD ${tddState}): \`${node.command}\` → ${node.description}`);
  } else if (node.predicate?.type === "brevity") {
    const max = node.predicate.value ?? 0;
    lines.push(`${indent}- ${mark} Proof (brevity ≤${max} violations): \`${node.command}\` → ${node.description}`);
  } else if (node.predicate?.type === "line_length") {
    const maxChars = node.predicate.max_line_length ?? DEFAULT_BREVITY_OPTS.maxLineLength;
    const maxV = node.predicate.value ?? 0;
    lines.push(
      `${indent}- ${mark} Proof (line_length ≤${maxChars} chars, max ${maxV} violations): \`${node.command}\` → ${node.description}`,
    );
  } else if (node.predicate?.type === "function_size") {
    const maxLines = node.predicate.max_function_lines ?? DEFAULT_BREVITY_OPTS.maxFunctionLines;
    const maxV = node.predicate.value ?? 0;
    lines.push(
      `${indent}- ${mark} Proof (function_size ≤${maxLines} lines, max ${maxV} violations): \`${node.command}\` → ${node.description}`,
    );
  } else if (node.predicate?.type === "file_size") {
    const maxLines = node.predicate.max_file_lines ?? DEFAULT_BREVITY_OPTS.maxFileLines;
    const maxV = node.predicate.value ?? 0;
    lines.push(
      `${indent}- ${mark} Proof (file_size ≤${maxLines} lines, max ${maxV} violations): \`${node.command}\` → ${node.description}`,
    );
  } else if (node.predicate?.type === "cohesion") {
    const maxCC = node.predicate.max_complexity ?? 5;
    const guards = node.predicate.require_guard_clauses ?? true;
    const suggest = node.predicate.suggest_guard_clauses ?? true;
    const flags = [guards ? "guard" : "", suggest ? "suggest" : ""].filter(Boolean).join("+");
    const maxV = node.predicate.value ?? 0;
    lines.push(
      `${indent}- ${mark} Proof (cohesion CC≤${maxCC}${flags ? ` ${flags}` : ""}, max ${maxV} violations): \`${node.command}\` → ${node.description}`,
    );
  } else if (node.predicate?.type === "replacement_ratio") {
    const minRatio = node.predicate.min_replacement_ratio ?? 0.2;
    const maxV = node.predicate.value ?? 0;
    lines.push(
      `${indent}- ${mark} Proof (replacement_ratio ≥${(minRatio * 100).toFixed(0)}%, max ${maxV} violations): \`${node.command}\` → ${node.description}`,
    );
  } else if (node.predicate?.type === "regression") {
    const lib = node.predicate.lower_is_better ?? true;
    const tol = node.predicate.value ?? 0;
    const dir = lib ? "≤baseline" : "≥baseline";
    lines.push(
      `${indent}- ${mark} Proof (regression ${dir}, tolerance ${tol}): \`${node.command}\` → ${node.description}`,
    );
  } else {
    lines.push(`${indent}- ${mark} Proof: \`${node.command}\` → ${node.description}`);
  }
}

// ── Main render ───────────────────────────────────────────────────────

export function renderMarkdown(doc: DodDocument): string {
  console.debug("author: renderMarkdown", { id: doc.id });
  const l: string[] = [];

  l.push(`# ${doc.title} — Requirements Spec`);
  l.push("");
  l.push("<claude_instructions>");
  l.push("**For Claude (/goal):** Work through each incomplete task below.");
  l.push("1. Mark a task `[>]` when you begin working on it.");
  l.push("2. Call `dod_check` to verify proofs — do NOT mark proofs manually.");
  l.push(
    "   While iterating on one subtree, pass `nodePath` to verify just that part fast (others are carried, not re-run). A scoped run returns INCOMPLETE, never PASS.",
  );
  l.push("3. A task group is complete when ALL its concrete proofs pass via `dod_check`.");
  l.push("3b. For `manual`/`review` proofs: `dod_check` never auto-prompts — call");
  l.push("    `dod_verify(dod_id, proof_id)` explicitly when verification is actually relevant.");
  l.push("3c. **Manual verification is a HARD GATE.** DoD cannot PASS without it.");
  l.push("    Proofs can pass against wrong code. Visual verification catches what metrics miss.");
  l.push(
    "4. Use `dod_refine` to turn a draft leaf into a concrete proof (mode=concretize) or subdivide into child tasks (mode=subdivide).",
  );
  l.push("4b. **Refine incrementally per task group, not all at once.** Scoped dod_check is faster");
  l.push("    than full runs — use it. Refining 7 drafts at session end = rubber-stamping.");
  l.push("4c. Use `dod_add_node` to add new nodes discovered during implementation.");
  l.push("5. If a proof cannot be met, use `dod_amend` to modify it with a reason.");
  l.push("5b. **Amending a proof 3+ times is a red flag** — you're probably tuning proofs to pass");
  l.push("    rather than fixing the bug. Re-examine the approach.");
  l.push("5c. Proof commands run on the HOST OS — write OS-correct commands (no bash on Windows).");
  l.push(
    "6. Continue until `dod_check` returns PASS (zero drafts, all proofs pass, manuals verified) — then stop and report done.",
  );
  l.push("6b. **If the approach isn't working, stop and re-interview.** Don't silently pivot to");
  l.push("    a different implementation while keeping the old DoD. The DoD must match what you're doing.");
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
      const children = root.children;
      if (!children) continue;

      const hasDrafts = hasDraftNodes(children);
      const allPass = isBranchLocked(children) && children.length > 0 && allLeavesPass(children);

      let mark: string;
      if (hasDrafts) mark = "[~]";
      else if (allPass) mark = "[x]";
      else mark = "[ ]";

      l.push("");
      l.push(`### ${root.title} ${mark}`);
      l.push("");

      for (const child of children) {
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
    // Use strict path-boundary comparison to avoid numeric prefix confusion
    // (e.g. "0.children.10".startsWith("0.children.1") → true but should be false)
    // Undefined ran_node_path → full tree ran, don't skip any leaf.
    // Otherwise use strict path-boundary comparison to avoid numeric
    // prefix confusion (e.g. "0.children.1" matching "0.children.10").
    const ranPath = result.ran_node_path;
    if (
      result.scoped &&
      ranPath != null &&
      leafResult.node_path !== ranPath &&
      !leafResult.node_path.startsWith(`${ranPath}.`)
    )
      continue;

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

// formatCheckResult re-exported from dedicated module
export { formatCheckResult } from "./format-result.js";

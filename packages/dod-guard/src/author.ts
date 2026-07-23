import { promises as fs } from "node:fs";
import * as path from "node:path";
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

// ── Render helpers ────────────────────────────────────────────────────────

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

  const mark = proofMark(node.last_status);
  let proofLine: string;

  if (node.predicate?.type === "manual" || node.predicate?.type === "review") {
    const mr = node.manual_result;
    const state = mr
      ? ` _(human-confirmed ${mr.answer.toUpperCase()} at ${mr.confirmed_at} via ${mr.channel})_`
      : " _(awaiting human verification)_";
    proofLine = `${indent}- ${mark} Proof: ${node.predicate.type === "review" ? "Review" : "Manual"} — ${node.description}${state}`;
  } else if (node.predicate?.type === "tdd") {
    const tddState = node.seen_failing ? (node.last_status === "pass" ? "GREEN" : "RED") : "AWAITING RED";
    proofLine = `${indent}- ${mark} Proof (TDD ${tddState}): \`${node.command}\` → ${node.description}`;
  } else if (node.predicate?.type === "adversarial") {
    const phase = node.predicate.value !== undefined ? Number(node.predicate.value) : 0;
    const phaseName = ["", "Spec", "Test", "Implement", "Cleanup"][phase] ?? `Phase ${phase}`;
    const gateState = node.last_status === "pass" ? "GO" : node.last_status === "fail" ? "NOT GO" : "PENDING";
    proofLine = `${indent}- ${mark} Proof (Adversarial ${phaseName} Gate ${gateState}): ${node.description}`;
  } else if (node.predicate?.type === "convergence") {
    const gateState = node.last_status === "pass" ? "GO" : node.last_status === "fail" ? "NOT GO" : "PENDING";
    proofLine = `${indent}- ${mark} Proof (Convergence Audit ${gateState}): ${node.description}`;
  } else if (node.predicate?.type === "holdout") {
    const fingerprint = node.predicate.value ? String(node.predicate.value).slice(0, 12) : "unknown";
    proofLine = `${indent}- ${mark} Proof (Holdout ${fingerprint}…): \`${node.command}\` → ${node.description}`;
  } else {
    proofLine = `${indent}- ${mark} Proof: \`${node.command}\` → ${node.description}`;
  }

  // Append predicate metadata for lossless round-trip parsing
  if (node.predicate) {
    proofLine += ` <!--p:${JSON.stringify(node.predicate)}-->`;
  }

  lines.push(proofLine);

  // Show diagnosis on failure
  if (node.last_status === "fail" && node.last_output) {
    const short = node.last_output.slice(0, 300);
    lines.push(`${indent}  > ⚠ ${short}`);
  }
}

// ── Main render ───────────────────────────────────────────────────────────

export function renderMarkdown(doc: DodDocument): string {
  const l: string[] = [];

  l.push(`# ${doc.title} — Requirements Spec`);
  l.push("");
  l.push("<claude_instructions>");
  l.push("**For the implementer:** Work through each task below.");
  l.push("1. Mark a task `[>]` when you begin working on it.");
  l.push("2. Call `dod_check` to verify proofs — do NOT mark proofs manually.");
  l.push("3. A task group is complete when ALL its concrete proofs pass via `dod_check`.");
  l.push("4. For `manual`/`review` proofs: call `dod_verify(dod_id, proof_id)` explicitly.");
  l.push("5. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.");
  l.push("6. If a proof cannot be met, use `dod_amend` to modify it with a reason.");
  l.push("7. Continue until `dod_check` returns PASS — then stop and report done.");
  l.push("");
  l.push("**Behavioral predicates only.** Each proof is a concrete behavioral claim.");
  l.push("Read failure diagnoses carefully — they tell you WHAT went wrong and what to fix.");
  l.push("Proofs run on the HOST OS — write OS-correct commands (no bash on Windows).");
  l.push("");
  l.push(`**CWD:** \`${doc.cwd}\``);
  l.push("");
  l.push("**Anti-cheat:** Proofs stored canonically in MCP storage.");
  l.push("`dod_check` executes commands from the canonical copy, not this markdown file.");
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

// ── Update from check result ──────────────────────────────────────────────

export function updateDocFromCheckResult(doc: DodDocument, result: CheckResult): void {
  for (const leafResult of result.leaves) {
    const node = findNodeByPath(doc.roots, leafResult.node_path);
    if (!node) continue;

    // Don't clobber carried-forward leaves on scoped runs
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
      // Include diagnosis in stored output if present
      node.last_output = leafResult.diagnosis
        ? `${leafResult.output ?? ""}\n\nDiagnosis: ${leafResult.diagnosis}`
        : leafResult.output;
      node.last_checked = result.timestamp;
    }
  }

  if (result.scoped) return;

  doc.last_check = {
    timestamp: result.timestamp,
    overall: result.overall,
    summary: result.summary,
  };
}

export { formatCheckResult } from "./format-result.js";

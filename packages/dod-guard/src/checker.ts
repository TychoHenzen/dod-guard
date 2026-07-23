import { exec } from "node:child_process";
import { promisify } from "node:util";
import { executeProof, type ProofExecutionOptions } from "./evaluate-proof.js";
import { computeProofFingerprint, flattenConcreteLeaves } from "./fingerprint.js";
import type { Amendment, CheckResult, DodDocument, LeafResult, TaskNode } from "./types.js";

const execAsync = promisify(exec);

// ── Tree utilities ────────────────────────────────────────────────────────

function nodeDraftOrDescendant(node: TaskNode): boolean {
  if (node.children && node.children.length > 0) return hasDraftNodes(node.children);
  return node.refinement === "draft";
}

export function hasDraftNodes(nodes: TaskNode[]): boolean {
  return nodes.some(nodeDraftOrDescendant);
}

function traverseNodePath(nodes: TaskNode[], parts: string[], depth: number): TaskNode | null {
  if (depth >= parts.length) return null;
  const segment = parts[depth];
  if (segment === "children") return traverseNodePath(nodes, parts, depth + 1);
  const idx = Number(segment);
  if (!Number.isInteger(idx) || idx < 0 || idx >= nodes.length) return null;
  const node = nodes[idx];
  const isLast = depth === parts.length - 1 || (depth === parts.length - 2 && parts[parts.length - 1] === "children");
  if (isLast) return node;
  if (!node.children) return null;
  return traverseNodePath(node.children, parts, depth + 1);
}

export function findNodeByPath(nodes: TaskNode[], path: string): TaskNode | null {
  if (!path) return null;
  return traverseNodePath(nodes, path.split("."), 0);
}

export function isExecutablePredicate(type: string): boolean {
  return type !== "manual" && type !== "review";
}

function isExecutableLeaf(leaf: { node: TaskNode }): boolean {
  return !!(leaf.node.command && leaf.node.predicate && isExecutablePredicate(leaf.node.predicate.type));
}

export function extractExecutableCommands(nodes: TaskNode[]): string[] {
  return flattenConcreteLeaves(nodes)
    .filter(isExecutableLeaf)
    .map(({ node }) => node.command as string);
}

export function isBranchLocked(nodes: TaskNode[]): boolean {
  return !hasDraftNodes(nodes);
}

function countNodeDrafts(node: TaskNode): number {
  if (node.children && node.children.length > 0) return countDraftNodes(node.children);
  return node.refinement === "draft" ? 1 : 0;
}

export function countDraftNodes(nodes: TaskNode[]): number {
  return nodes.reduce((sum, node) => sum + countNodeDrafts(node), 0);
}

// ── Amendment helpers ─────────────────────────────────────────────────────

export function countNodeAmendments(amendments: Amendment[], nodePath: string): number {
  return amendments.filter((a) => a.node_path === nodePath && (a.action === "modified" || a.action === "refined"))
    .length;
}

export function checkAmendGate(
  amendments: Amendment[],
  resolvedPath: string,
  amendJustification?: string,
): string | null {
  const amendCount = countNodeAmendments(amendments, resolvedPath);

  if (amendCount >= 3 && !amendJustification) {
    return `This node has been amended ${amendCount} times. Provide amend_justification explaining why further amendments are needed.`;
  }

  return null;
}

// ── Leaf collection ───────────────────────────────────────────────────────

function collectAllConcreteLeaves(
  nodes: TaskNode[],
  parentPath: string,
  out: { node: TaskNode; node_path: string }[],
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      collectAllConcreteLeaves(node.children, currentPath, out);
    } else if (node.refinement === "concrete") {
      out.push({ node, node_path: currentPath });
    }
  }
}

function partitionLeaves(
  roots: TaskNode[],
  targetPath?: string,
): { inScope: { node: TaskNode; node_path: string }[]; outOfScope: { node: TaskNode; node_path: string }[] } {
  if (!targetPath) {
    const allLeaves: { node: TaskNode; node_path: string }[] = [];
    collectAllConcreteLeaves(roots, "", allLeaves);
    return { inScope: allLeaves, outOfScope: [] };
  }

  const target = findNodeByPath(roots, targetPath);
  if (!target) return { inScope: [], outOfScope: [] };

  const inScope: { node: TaskNode; node_path: string }[] = [];
  if (target.children) {
    flattenTargetLeaves(target.children, targetPath, inScope);
  } else if (target.refinement === "concrete") {
    inScope.push({ node: target, node_path: targetPath });
  }

  const allLeaves = flattenConcreteLeaves(roots);
  const inScopePaths = new Set(inScope.map((l) => l.node_path));
  const outOfScope = allLeaves.filter((l) => !inScopePaths.has(l.node_path));

  return { inScope, outOfScope };
}

function flattenTargetLeaves(
  nodes: TaskNode[],
  parentPath: string,
  out: { node: TaskNode; node_path: string }[],
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = `${parentPath}.children.${i}`;
    if (node.children && node.children.length > 0) {
      flattenTargetLeaves(node.children, currentPath, out);
    } else if (node.refinement === "concrete") {
      out.push({ node, node_path: currentPath });
    }
  }
}

function carryForwardNode(node: TaskNode, node_path: string): LeafResult {
  return {
    node_path,
    id: node.id,
    title: node.title,
    description: node.description ?? node.intent ?? node.title,
    status:
      node.last_status === "pending" || node.last_status === "draft"
        ? "skipped"
        : (node.last_status as LeafResult["status"]),
    command: node.command ?? "",
    output: node.last_output,
  };
}

function addDraftLeafResults(nodes: TaskNode[], parentPath: string, out: LeafResult[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      addDraftLeafResults(node.children, currentPath, out);
    } else if (node.refinement === "draft") {
      out.push({
        node_path: currentPath,
        id: node.id,
        title: node.title,
        description: node.intent ?? node.title,
        status: "draft",
        command: "",
        output: "DRAFT — refine with dod_refine before this proof can be verified.",
      });
    }
  }
}

function carryForwardDrafts(nodes: TaskNode[], parentPath: string, targetPath: string, out: LeafResult[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    const isUnderTarget = currentPath === targetPath || currentPath.startsWith(`${targetPath}.`);
    if (node.children && node.children.length > 0) {
      if (isUnderTarget) continue;
      carryForwardDrafts(node.children, currentPath, targetPath, out);
    } else if (node.refinement === "draft" && !isUnderTarget) {
      out.push({
        node_path: currentPath,
        id: node.id,
        title: node.title,
        description: node.intent ?? node.title,
        status: "draft",
        command: "",
        output: "DRAFT — refine with dod_refine before this proof can be verified.",
      });
    }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────

export interface CheckOptions {
  nodePath?: string;
  /** Collapse unchanged drafts into a single count line (--summary). Default: false. */
  summary?: boolean;
}

export async function checkDocument(doc: DodDocument, cwdOverride?: string, opts?: CheckOptions): Promise<CheckResult> {
  const cwd = cwdOverride ?? doc.cwd;
  const targetPath = opts?.nodePath;

  const { inScope, outOfScope } = partitionLeaves(doc.roots, targetPath);
  const draftCount = countDraftNodes(doc.roots);

  const leafResults: LeafResult[] = [];

  // Carry forward out-of-scope leaves for scoped runs
  if (targetPath) {
    for (const { node, node_path } of outOfScope) {
      leafResults.push(carryForwardNode(node, node_path));
    }
    carryForwardDrafts(doc.roots, "", targetPath, leafResults);
  }

  // ── VCS state capture (full checks only) ─────────────────────────────
  let checkedCommit: string | undefined;
  let checkedDirty: boolean | undefined;
  let isGitRepo: boolean | undefined;

  if (!targetPath) {
    try {
      const { stdout: commitOut } = await execAsync("git rev-parse HEAD", { cwd });
      checkedCommit = commitOut.trim();
      isGitRepo = true;
      const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd });
      checkedDirty = statusOut.trim().length > 0;
    } catch {
      isGitRepo = false;
    }
  }

  // ── Execute proofs ───────────────────────────────────────────────────
  let anyFail = false;
  let manualUnverified = 0;
  const proofOpts: ProofExecutionOptions = {
    adversarial_gates: doc.adversarial_gates ?? [],
  };

  for (const { node, node_path } of inScope) {
    const result = await executeProof(node, cwd, proofOpts);
    result.node_path = node_path;
    leafResults.push(result);

    if (result.status === "fail" && !node.advisory) anyFail = true;

    const isManualOrReview = node.predicate?.type === "manual" || node.predicate?.type === "review";
    if (result.status === "skipped" && isManualOrReview) manualUnverified++;
  }

  // Add draft leaves
  if (!targetPath) {
    addDraftLeafResults(doc.roots, "", leafResults);
  }

  // ── Fingerprint + tamper detection ────────────────────────────────────
  const proofFingerprint = computeProofFingerprint(doc.roots);
  const tampered = !!(doc.proof_fingerprint && doc.proof_fingerprint !== proofFingerprint);

  // ── Verdict ───────────────────────────────────────────────────────────
  let overall: CheckResult["overall"];

  if (tampered) {
    overall = "fail";
  } else if (targetPath) {
    overall = "incomplete";
  } else if (draftCount > 0) {
    overall = "incomplete";
  } else if (anyFail) {
    overall = "fail";
  } else if (manualUnverified > 0) {
    overall = "incomplete";
  } else {
    overall = "pass";
  }

  // Downgrade PASS when tree is dirty
  if (overall === "pass" && checkedDirty && !doc.allow_dirty_pass) {
    overall = "pass_dirty";
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const concreteTotal = leafResults.filter((r) => r.status !== "draft").length;
  const passCount = leafResults.filter((r) => r.status === "pass").length;

  let baseSummary: string;

  if (tampered) {
    baseSummary = `TAMPER DETECTED — proof-set fingerprint mismatch (store edited outside dod_amend). Verdict forced to FAIL.`;
  } else if (targetPath) {
    baseSummary = `SCOPED (node "${targetPath}"): run a full dod_check to verify completion. ${passCount}/${concreteTotal} proofs pass.`;
  } else {
    baseSummary = `${passCount}/${concreteTotal} concrete proofs pass${draftCount > 0 ? `, ${draftCount} draft node(s) not verified` : ""}`;
  }

  // Add guidance lines
  const guidance: string[] = [];

  if (manualUnverified > 0) {
    guidance.push(`${manualUnverified} manual/review proof(s) await dod_verify.`);
  }

  if (!targetPath && draftCount > 0) {
    guidance.push(`${draftCount} draft node(s) — refine with dod_refine, then re-run dod_check.`);
  }

  const summary = guidance.length > 0 ? [baseSummary, "", ...guidance].join("\n") : baseSummary;

  return {
    overall,
    leaves: leafResults,
    summary,
    timestamp: new Date().toISOString(),
    proof_fingerprint: proofFingerprint,
    draft_count: draftCount,
    manual_unverified: manualUnverified,
    summary_mode: opts?.summary === true ? true : undefined,
    ...(targetPath ? { scoped: true, ran_node_path: targetPath } : {}),
    ...(tampered ? { tampered: true } : {}),
    checked_commit: checkedCommit,
    checked_dirty: checkedDirty,
    is_git_repo: isGitRepo,
  };
}

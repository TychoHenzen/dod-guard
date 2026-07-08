import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { DodDocument, CheckResult, LeafResult, TaskNode } from "./types.js";
import { executeProof, parseSurvivors, type ExecFn } from "./evaluate-proof.js";

const execAsync = promisify(exec);

const TIMEOUT_MS = 120_000;

// ── Tree utilities ────────────────────────────────────────────────────

/**
 * Walk the TaskNode tree depth-first, collecting every concrete leaf
 * (refinement === "concrete", no children) with its dot-separated path.
 * Draft leaves and task groups are excluded.
 */
export function flattenConcreteLeaves(
  nodes: TaskNode[],
  parentPath?: string,
): { node: TaskNode; node_path: string }[] {
  const results: { node: TaskNode; node_path: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      results.push(...flattenConcreteLeaves(node.children, currentPath));
    } else if (node.refinement === "concrete") {
      results.push({ node, node_path: currentPath });
    }
    // Draft leaves are intentionally skipped
  }
  return results;
}

/** True when any node in the subtree is a draft leaf (refinement === "draft"). */
export function hasDraftNodes(nodes: TaskNode[]): boolean {
  for (const node of nodes) {
    if (node.refinement === "draft") return true;
    if (node.children && hasDraftNodes(node.children)) return true;
  }
  return false;
}

/** Find a node by its dot-separated path, e.g. "0.children.1.children.2". */
export function findNodeByPath(nodes: TaskNode[], path: string): TaskNode | null {
  if (!path) return null;
  const parts = path.split(".");
  let current: TaskNode[] = nodes;
  for (let i = 0; i < parts.length; i++) {
    // Every other segment is "children" (skip it)
    if (parts[i] === "children") continue;
    const idx = Number(parts[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return null;
    const node = current[idx];
    if (i === parts.length - 1 || (i === parts.length - 2 && parts[parts.length - 1] === "children")) {
      return node;
    }
    if (!node.children) return null;
    current = node.children;
  }
  return null;
}

/**
 * True when the predicate type requires an executable command that runs on
 * the host OS. Out-of-band types (manual, review) are verified by humans and
 * never need tool-resolution checks.
 */
export function isExecutablePredicate(type: string): boolean {
  return type !== "manual" && type !== "review";
}

/** Collect commands from all concrete leaves that need OS validation. */
export function extractExecutableCommands(nodes: TaskNode[]): string[] {
  const cmds: string[] = [];
  for (const { node } of flattenConcreteLeaves(nodes)) {
    if (node.command && node.predicate && isExecutablePredicate(node.predicate.type)) {
      cmds.push(node.command);
    }
  }
  return cmds;
}

/** @deprecated Use extractExecutableCommands instead. */
export const extractCommands = extractExecutableCommands;

/** True when every leaf in the subtree is concrete (no drafts remaining). */
export function isBranchLocked(nodes: TaskNode[]): boolean {
  return !hasDraftNodes(nodes);
}

/** Count draft leaves in a subtree. */
export function countDraftNodes(nodes: TaskNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.refinement === "draft") count++;
    if (node.children) count += countDraftNodes(node.children);
  }
  return count;
}

// ── Re-export parseSurvivors from evaluate-proof ──────────────────────────
export { parseSurvivors } from "./evaluate-proof.js";

// ── Proof-set fingerprint ─────────────────────────────────────────────

/**
 * Proof-set fingerprint for tamper detection. Hashes every concrete leaf's
 * command|type|value (+ advisory and lower_is_better when present).
 * Draft nodes excluded — nothing to hash. Grows as leaves are refined.
 */
export function computeProofFingerprint(roots: TaskNode[]): string {
  const leaves = flattenConcreteLeaves(roots);
  if (leaves.length === 0) return "";
  const data = leaves
    .map(({ node }) => {
      let line = `${node.command}|${node.predicate!.type}|${node.predicate!.value ?? ""}`;
      if (node.predicate!.lower_is_better !== undefined) line += `|lib:${node.predicate!.lower_is_better}`;
      if (node.advisory !== undefined) line += `|adv:${node.advisory}`;
      return line;
    })
    .join("\n");
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

// ── Command execution ─────────────────────────────────────────────────

async function runCommand(command: string, cwd: string): Promise<{
  exitCode: number; combined: string; duration: number;
  error?: string; killed?: boolean; notFound?: boolean;
}> {
  const start = Date.now();
  try {
    const shellCmd = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      shell: shellCmd,
      windowsHide: true,
    });
    return { exitCode: 0, combined: (stdout + stderr).slice(0, 4000), duration: Date.now() - start };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("checker: exec failed", { cmd: command.slice(0, 80), err: msg });
    const execErr = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean; message?: string };
    const exitCode = execErr.code ?? 1;
    const stdout = (execErr.stdout ?? "") as string;
    const stderr = (execErr.stderr ?? "") as string;
    const combined = (stdout + stderr).slice(0, 4000);

    if (execErr.killed) {
      return { exitCode, combined: `TIMEOUT after ${TIMEOUT_MS}ms`, duration, error: "Process killed due to timeout", killed: true };
    }

    const notFound = exitCode === 127 || exitCode === 9009
      || /not recognized|command not found|no such file/i.test(stderr + (execErr.message ?? ""));
    if (notFound) {
      return { exitCode, combined, duration, error: `Command not found or not executable (exit ${exitCode})`, notFound: true };
    }

    return { exitCode, combined, duration, error: stderr.slice(0, 2000) || undefined };
  }
}

// â”€â”€ Proof execution imported from evaluate-proof.ts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ── Carry-forward (scoped runs) ───────────────────────────────────────

/**
 * Build a LeafResult from a concrete node's persisted state, without executing.
 * Used for nodes outside the target subtree on scoped runs.
 */
function carryForwardNode(node: TaskNode, node_path: string): LeafResult {
  return {
    node_path,
    id: node.id,
    title: node.title,
    description: node.description ?? node.intent ?? node.title,
    status: node.last_status === "pending" || node.last_status === "draft" ? "skipped" : node.last_status as LeafResult["status"],
    command: node.command ?? "",
    output: node.last_output,
  };
}

/**
 * Flatten all concrete leaves, carrying forward all of them without execution.
 * Used for nodes outside the scoped subtree.
 */
function carryForwardAll(nodes: TaskNode[], parentPath?: string): LeafResult[] {
  const results: LeafResult[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      results.push(...carryForwardAll(node.children, currentPath));
    } else if (node.refinement === "concrete") {
      results.push(carryForwardNode(node, currentPath));
    }
    // Draft leaves: also carried forward
    if (node.refinement === "draft") {
      results.push({
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
  return results;
}

/**
 * Collect all leaves (concrete + draft) under a specific node path.
 * Returns {inScope, outOfScope} where inScope are the matching subtree.
 */
function partitionLeaves(
  roots: TaskNode[],
  targetPath?: string,
): { inScope: { node: TaskNode; node_path: string }[]; outOfScope: { node: TaskNode; node_path: string }[] } {
  if (!targetPath) {
    // No scoping: everything is in-scope
    const allLeaves: { node: TaskNode; node_path: string }[] = [];
    const allDrafts: { node: TaskNode; node_path: string }[] = [];
    collectAllLeaves(roots, "", allLeaves, allDrafts);
    return { inScope: allLeaves.filter(l => l.node.refinement === "concrete"), outOfScope: [] };
  }

  // Find the target node
  const target = findNodeByPath(roots, targetPath);
  if (!target) return { inScope: [], outOfScope: [] };

  // Collect leaves under target (in scope)
  const inScope: { node: TaskNode; node_path: string }[] = [];
  if (target.children) {
    flattenTargetLeaves(target.children, targetPath, inScope);
  } else if (target.refinement === "concrete") {
    inScope.push({ node: target, node_path: targetPath });
  }

  // Collect ALL leaves, then filter out those in scope
  const allLeaves = flattenConcreteLeaves(roots);
  const inScopePaths = new Set(inScope.map(l => l.node_path));
  const outOfScope = allLeaves.filter(l => !inScopePaths.has(l.node_path));

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

function collectAllLeaves(
  nodes: TaskNode[],
  parentPath: string,
  concrete: { node: TaskNode; node_path: string }[],
  drafts: { node: TaskNode; node_path: string }[],
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      collectAllLeaves(node.children, currentPath, concrete, drafts);
    } else if (node.refinement === "concrete") {
      concrete.push({ node, node_path: currentPath });
    } else if (node.refinement === "draft") {
      drafts.push({ node, node_path: currentPath });
    }
  }
}

// ── Main entry point ──────────────────────────────────────────────────

export async function checkDocument(
  doc: DodDocument,
  cwdOverride?: string,
  opts?: { nodePath?: string; execFn?: typeof runCommand },
): Promise<CheckResult> {
  const cwd = cwdOverride ?? doc.cwd;
  const targetPath = opts?.nodePath;

  const { inScope, outOfScope } = partitionLeaves(doc.roots, targetPath);
  const draftCount = countDraftNodes(doc.roots);

  const leafResults: LeafResult[] = [];

  // Carry forward out-of-scope leaves (scoped runs only)
  if (targetPath && outOfScope.length > 0) {
    for (const { node, node_path } of outOfScope) {
      leafResults.push(carryForwardNode(node, node_path));
    }
    // Also carry forward draft leaves
    carryForwardDrafts(doc.roots, "", targetPath, leafResults);
  }

  // Execute in-scope leaves
  let anyRealFail = false;
  let anyUnverified = false;
  let manualUnverified = 0;

  for (const { node, node_path } of inScope) {
    // Attach the path for result identification
    const result = await executeProof(node, cwd, opts?.execFn ?? runCommand);
    result.node_path = node_path;
    leafResults.push(result);

    if (result.status === "fail" && !node.advisory) {
      anyRealFail = true;
    }
    if (result.status === "skipped" && !node.advisory) {
      anyUnverified = true;
    }
    // Count unverified manual/review proofs separately
    const isManualOrReview = node.predicate?.type === "manual" || node.predicate?.type === "review";
    if (result.status === "skipped" && isManualOrReview) {
      manualUnverified++;
    }
  }

  // If not scoped, also add draft leaf results
  if (!targetPath) {
    addDraftLeafResults(doc.roots, "", leafResults);
  }

  // Amendment cycle detection: count amendments per node, warn on >2
  const amendmentCounts = new Map<string, { title: string; count: number }>();
  for (const a of doc.amendments) {
    if (a.action === "modified" || a.action === "refined") {
      const existing = amendmentCounts.get(a.node_path);
      if (existing) {
        existing.count++;
      } else {
        // Try to find the node title
        const node = findNodeByPath(doc.roots, a.node_path);
        amendmentCounts.set(a.node_path, { title: node?.title ?? a.node_path, count: 1 });
      }
    }
  }
  const amendmentWarnings = [...amendmentCounts.entries()]
    .filter(([, v]) => v.count > 2)
    .map(([node_path, v]) => ({ node_path, title: v.title, count: v.count }));

  // Blocked by manuals: all automated proofs pass but manuals await verification
  const blockedByManuals = !targetPath && draftCount === 0 && !anyRealFail && manualUnverified > 0;

  // Scoped check suggestion: full run with many concrete leaves
  const concreteCount = inScope.length + outOfScope.length;
  const suggestScoped = !targetPath && concreteCount > 5 && draftCount > 0;

  // Proof-set fingerprint
  const proofFingerprint = computeProofFingerprint(doc.roots);

  // Tamper detection
  const tampered = !!(doc.proof_fingerprint && doc.proof_fingerprint !== proofFingerprint);

  // Overall verdict
  const overall: CheckResult["overall"] = tampered
    ? "fail"
    : targetPath
      ? "incomplete"
      : draftCount > 0
        ? "incomplete"
        : anyRealFail
          ? "fail"
          : anyUnverified
            ? "incomplete"
            : "pass";

  const concreteTotal = leafResults.filter(r => r.status !== "draft").length;
  const passCount = leafResults.filter(r => r.status === "pass").length;

  const baseSummary = targetPath
    ? `SCOPED (node "${targetPath}"): run a full dod_check (no nodePath) to verify completion`
    : `${passCount}/${concreteTotal} concrete proofs pass${draftCount > 0 ? `, ${draftCount} draft node(s) not verified` : ""}`;

  // Build guidance lines
  const guidance: string[] = [];

  if (blockedByManuals) {
    guidance.push(`⛔ ${manualUnverified} manual/review proof(s) await dod_verify — DoD CANNOT pass without human verification.`);
  } else if (!targetPath && manualUnverified > 0) {
    guidance.push(`${manualUnverified} manual/review proof(s) await dod_verify.`);
  }

  if (amendmentWarnings.length > 0) {
    const names = amendmentWarnings.map(w => `"${w.title}" (${w.count} amendments)`).join(", ");
    guidance.push(`⚠️ Excessive amendment cycles: ${names} — are proofs being tuned rather than code being fixed?`);
  }

  if (suggestScoped) {
    guidance.push(`💡 ${concreteCount} concrete proofs — use dod_check(nodePath="0") to verify one subtree at a time (faster iteration).`);
  }

  if (!targetPath && draftCount > 0 && !suggestScoped) {
    guidance.push(`${draftCount} draft node(s) — refine incrementally per task group with dod_refine, not all at once at the end.`);
  }

  const summary = tampered
    ? `TAMPER DETECTED — proof-set fingerprint mismatch (store edited outside dod_amend). Verdict forced to FAIL. ${baseSummary}`
    : guidance.length > 0
      ? [baseSummary, "", ...guidance].join("\n")
      : baseSummary;

  return {
    overall,
    leaves: leafResults,
    summary,
    timestamp: new Date().toISOString(),
    proof_fingerprint: proofFingerprint,
    draft_count: draftCount,
    manual_unverified: manualUnverified,
    amendment_warnings: amendmentWarnings,
    blocked_by_manuals: blockedByManuals,
    ...(targetPath ? { scoped: true, ran_node_path: targetPath } : {}),
    ...(tampered ? { tampered: true } : {}),
  };
}

/** Helper: add draft LeafResults for all draft nodes in the tree. */
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

/** Helper: carry forward draft leaves for scoped runs. */
function carryForwardDrafts(nodes: TaskNode[], parentPath: string, targetPath: string, out: LeafResult[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      // Only descend into children if targetPath starts with this prefix
      if (targetPath.startsWith(currentPath)) continue; // in scope, handled by execute
      carryForwardDrafts(node.children, currentPath, targetPath, out);
    } else if (node.refinement === "draft" && !targetPath.startsWith(currentPath)) {
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

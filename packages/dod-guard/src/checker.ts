import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { DodDocument, CheckResult, LeafResult, TaskNode } from "./types.js";
import { executeProof, parseSurvivors, type ExecFn } from "./evaluate-proof.js";
import { CMD_TRUNCATION } from "./constants.js";

const execAsync = promisify(exec);

const TIMEOUT_MS = 120_000;

// ── Tree utilities

/** Per-node helper: apply the flatten logic to a single node. */
function flattenLeaf(node: TaskNode, index: number, parentPath?: string): { node: TaskNode; node_path: string }[] {
  const currentPath = parentPath ? `${parentPath}.children.${index}` : `${index}`;
  if (node.children && node.children.length > 0) {
    return flattenConcreteLeaves(node.children, currentPath);
  } else if (node.refinement === "concrete") {
    return [{ node, node_path: currentPath }];
  }
  return [];
}

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
    results.push(...flattenLeaf(nodes[i], i, parentPath));
  }
  return results;
}

/** Per-node helper: check if a single node is draft or has draft descendants. */
function nodeDraftOrDescendant(node: TaskNode): boolean {
  // Task groups are structural — only leaves can be drafts.
  if (node.children && node.children.length > 0) return hasDraftNodes(node.children);
  return node.refinement === "draft";
}

/** True when any node in the subtree is a draft leaf (refinement === "draft"). */
export function hasDraftNodes(nodes: TaskNode[]): boolean {
  return nodes.some(nodeDraftOrDescendant);
}

/** Recursive path traversal: walk node tree by path segments. */
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

/** Find a node by its dot-separated path, e.g. "0.children.1.children.2". */
export function findNodeByPath(nodes: TaskNode[], path: string): TaskNode | null {
  if (!path) return null;
  return traverseNodePath(nodes, path.split("."), 0);
}

/**
 * True when the predicate type requires an executable command that runs on
 * the host OS. Out-of-band types (manual, review) are verified by humans and
 * never need tool-resolution checks.
 */
export function isExecutablePredicate(type: string): boolean {
  return type !== "manual" && type !== "review";
}

function isExecutableLeaf(leaf: { node: TaskNode }): boolean {
  return !!(leaf.node.command && leaf.node.predicate && isExecutablePredicate(leaf.node.predicate.type));
}

/** Collect commands from all concrete leaves that need OS validation. */
export function extractExecutableCommands(nodes: TaskNode[]): string[] {
  return flattenConcreteLeaves(nodes)
    .filter(isExecutableLeaf)
    .map(({ node }) => node.command!);
}

/** @deprecated Use extractExecutableCommands instead. */
export const extractCommands = extractExecutableCommands;

/** True when every leaf in the subtree is concrete (no drafts remaining). */
export function isBranchLocked(nodes: TaskNode[]): boolean {
  return !hasDraftNodes(nodes);
}

function countNodeDrafts(node: TaskNode): number {
  // Task groups are structural containers — only leaves can be drafts.
  // A group with refinement="draft" but children populated is a task group, not a draft leaf.
  if (node.children && node.children.length > 0) return countDraftNodes(node.children);
  return node.refinement === "draft" ? 1 : 0;
}

/** Count draft leaves in a subtree. */
export function countDraftNodes(nodes: TaskNode[]): number {
  return nodes.reduce((sum, node) => sum + countNodeDrafts(node), 0);
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
    console.error("checker: exec failed", { cmd: command.slice(0, CMD_TRUNCATION), err: msg });
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

// â”€â”€ 

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

// ── Main entry point helpers ──────────────────────────────────────────

/** Carry forward out-of-scope leaves and their drafts for a scoped run. */
function carryForwardOutOfScopeLeaves(
  targetPath: string | undefined,
  outOfScope: { node: TaskNode; node_path: string }[],
  roots: TaskNode[],
  leafResults: LeafResult[],
): void {
  if (!targetPath || outOfScope.length === 0) return;
  for (const { node, node_path } of outOfScope) {
    leafResults.push(carryForwardNode(node, node_path));
  }
  carryForwardDrafts(roots, "", targetPath, leafResults);
}

/** Execute all in-scope proofs, collecting results and aggregate flags. */
async function executeInScopeLeaves(
  inScope: { node: TaskNode; node_path: string }[],
  cwd: string,
  execFn: typeof runCommand,
  leafResults: LeafResult[],
): Promise<{ anyRealFail: boolean; anyUnverified: boolean; manualUnverified: number }> {
  let anyRealFail = false;
  let anyUnverified = false;
  let manualUnverified = 0;
  for (const { node, node_path } of inScope) {
    const result = await executeProof(node, cwd, execFn);
    result.node_path = node_path;
    leafResults.push(result);
    if (result.status === "fail" && !node.advisory) anyRealFail = true;
    if (result.status === "skipped" && !node.advisory) anyUnverified = true;
    const isManualOrReview = node.predicate?.type === "manual" || node.predicate?.type === "review";
    if (result.status === "skipped" && isManualOrReview) manualUnverified++;
  }
  return { anyRealFail, anyUnverified, manualUnverified };
}

/** Build amendment-count map from amendment history. */
function collectAmendmentCounts(
  amendments: DodDocument["amendments"],
  roots: TaskNode[],
): Map<string, { title: string; count: number }> {
  const amendmentCounts = new Map<string, { title: string; count: number }>();
  for (const a of amendments) {
    if (a.action === "modified" || a.action === "refined") {
      const existing = amendmentCounts.get(a.node_path);
      if (existing) {
        existing.count++;
      } else {
        const node = findNodeByPath(roots, a.node_path);
        amendmentCounts.set(a.node_path, { title: node?.title ?? a.node_path, count: 1 });
      }
    }
  }
  return amendmentCounts;
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

  carryForwardOutOfScopeLeaves(targetPath, outOfScope, doc.roots, leafResults);

  const { anyRealFail, anyUnverified, manualUnverified } = await executeInScopeLeaves(
    inScope, cwd, opts?.execFn ?? runCommand, leafResults,
  );

  if (!targetPath) {
    addDraftLeafResults(doc.roots, "", leafResults);
  }

  const amendmentCounts = collectAmendmentCounts(doc.amendments, doc.roots);
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

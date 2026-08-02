// Proof execution engine: runs a DoD's in-scope proofs and returns one
// verdict plus per-leaf detail. See checker-tree.ts, checker-leaves.ts,
// checker-vcs.ts, checker-verdict.ts, checker-summary.ts and
// checker-result.ts for the pieces this composes.
import { type ConcreteEntry, runConcreteLeaves } from "./checker-leaves.js";
import type { Verdict } from "./checker-result.js";
import { buildSummary } from "./checker-summary.js";
import {
  checkAmendGate,
  collectDraftLeaves,
  countDraftNodes,
  countNodeAmendments,
  findNodeByPath,
  hasDraftNodes,
  isBranchLocked,
} from "./checker-tree.js";
import { captureVcsState, type VcsState } from "./checker-vcs.js";
import { computeOverall } from "./checker-verdict.js";
import { computeProofFingerprint } from "./fingerprint.js";
import type { CheckResult, DodDocument, LeafResult, TaskNode } from "./types.js";

export { checkAmendGate, countDraftNodes, countNodeAmendments, findNodeByPath, hasDraftNodes, isBranchLocked };

export interface CheckOptions {
  nodePath?: string;
  summary?: boolean;
}

function draftResult(node: TaskNode, node_path: string): LeafResult {
  return {
    node_path,
    id: node.id,
    title: node.title,
    description: node.description ?? node.intent ?? node.title,
    status: "draft",
    command: node.command ?? "",
  };
}

function isUnderScope(path: string, nodePath?: string): boolean {
  if (nodePath === undefined) return false;
  return path === nodePath || path.startsWith(`${nodePath}.`);
}

function isNonAdvisoryFail(entry: ConcreteEntry): boolean {
  return entry.result.status === "fail" && !entry.node.advisory;
}

function isStuck(entry: ConcreteEntry): boolean {
  const amended = (entry.node.amend_count ?? 0) >= 3;
  return isNonAdvisoryFail(entry) && amended;
}

function countLeafStatuses(leaves: LeafResult[]): { pass: number; total: number; draft: number } {
  const draft = leaves.filter((l) => l.status === "draft").length;
  const pass = leaves.filter((l) => l.status === "pass").length;
  return { pass, total: leaves.length - draft, draft };
}

async function gatherVcs(scoped: boolean, cwd: string): Promise<Partial<VcsState>> {
  return scoped ? {} : captureVcsState(cwd);
}

function computeVerdict(doc: DodDocument, entries: ConcreteEntry[], scoped: boolean, vcs: Partial<VcsState>): Verdict {
  const computedFingerprint = computeProofFingerprint(doc.roots);
  const stored = doc.proof_fingerprint;
  const tampered = stored !== undefined && stored !== computedFingerprint;
  const draftCount = countDraftNodes(doc.roots);
  const overall = computeOverall({
    tampered,
    scoped,
    draftCount,
    stuck: entries.some(isStuck),
    anyFail: entries.some(isNonAdvisoryFail),
    dirty: vcs.checked_dirty === true,
    allowDirtyPass: doc.allow_dirty_pass === true,
  });
  return { overall, tampered, computedFingerprint, draftCount };
}

export async function checkDocument(
  doc: DodDocument,
  cwdOverride?: string,
  opts: CheckOptions = {},
): Promise<CheckResult> {
  const cwd = cwdOverride ?? doc.cwd;
  const { nodePath, summary } = opts;
  const scoped = nodePath !== undefined;

  const entries = await runConcreteLeaves(doc.roots, cwd, doc.amendments, doc.adversarial_gates ?? [], nodePath);
  const vcs = await gatherVcs(scoped, cwd);
  const draftEntries = collectDraftLeaves(doc.roots).filter(
    ({ node_path }) => !isUnderScope(node_path, scoped ? nodePath : undefined),
  );
  const drafts = draftEntries.map(({ node, node_path }) => draftResult(node, node_path));
  const leaves = [...entries.map((e) => e.result), ...drafts];

  const verdict = computeVerdict(doc, entries, scoped, vcs);
  const counts = countLeafStatuses(leaves);

  return {
    overall: verdict.overall,
    leaves,
    summary: buildSummary(verdict.overall, counts),
    timestamp: new Date().toISOString(),
    proof_fingerprint: verdict.computedFingerprint,
    draft_count: verdict.draftCount,
    ...(scoped ? { scoped: true, ran_node_path: nodePath } : {}),
    ...(verdict.tampered ? { tampered: true } : {}),
    summary_mode: summary === true ? true : undefined,
    ...vcs,
  };
}

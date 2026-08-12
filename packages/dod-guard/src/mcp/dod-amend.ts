/**
 * dod_amend adapter. Bulk mode (node_path="*") and single mode both funnel
 * through the same applyAmendment/finalizeAmend pair. The mutation and the
 * audit trail are written once, not twice.
 */
import { writeMarkdown } from "../author.js";
import { checkAmendGate, findNodeByPath } from "../checker.js";
import { findMissingTools } from "../command-check.js";
import { computeProofFingerprint, flattenConcreteLeaves } from "../fingerprint.js";
import * as store from "../store.js";
import { findNodeById, formatMissingTools } from "../tree-utils.js";
import type { DodDocument, Predicate, TaskNode } from "../types.js";
import { isDocError, resolveDoc } from "./resolve.js";

interface AmendParams {
  dod_id: string;
  node_path: string;
  node_id?: string;
  new_command?: string;
  new_predicate?: Predicate;
  new_description?: string;
  new_title?: string;
  reason: string;
  amend_justification?: string;
}

export async function handleDodAmend(params: AmendParams): Promise<string> {
  const resolved = await resolveDoc(params.dod_id);
  if (isDocError(resolved)) return resolved;
  const doc = resolved;

  if (params.node_path === "*") {
    if (params.node_id) return 'ERROR: node_id is incompatible with node_path="*"';
    return amendBulk(doc, params);
  }
  return amendSingle(doc, params);
}

function resolveTarget(doc: DodDocument, params: AmendParams): { node: TaskNode; path: string } | string {
  if (params.node_id) {
    const found = findNodeById(doc.roots, params.node_id);
    if (!found) return `ERROR: node not found by id "${params.node_id}".`;
    return { node: found.node, path: found.path };
  }
  const node = findNodeByPath(doc.roots, params.node_path);
  if (!node) return `ERROR: node not found at path "${params.node_path}".`;
  return { node, path: params.node_path };
}

/** Refuse a non-empty command that names a tool absent on this OS. */
async function rejectMissingTools(command: string, cwd: string): Promise<string | null> {
  if (command.trim() === "") return null;
  const missing = await findMissingTools([command], cwd);
  return missing.length > 0 ? formatMissingTools(missing) : null;
}

function effectiveCommand(params: AmendParams, node: TaskNode): string {
  return params.new_command ?? node.command ?? "";
}

async function guardSingle(
  doc: DodDocument,
  params: AmendParams,
  node: TaskNode,
  path: string,
): Promise<string | null> {
  if (node.refinement === "draft") {
    return "ERROR: node is a draft. Use dod_refine to concretize it first.";
  }
  const cmd = effectiveCommand(params, node);
  const osMsg = await rejectMissingTools(cmd, doc.cwd);
  if (osMsg) return osMsg;
  return checkAmendGate(doc.amendments, path, params.amend_justification);
}

async function amendSingle(doc: DodDocument, params: AmendParams): Promise<string> {
  const target = resolveTarget(doc, params);
  if (typeof target === "string") return target;
  const { node, path } = target;

  const guardMsg = await guardSingle(doc, params, node, path);
  if (guardMsg) return guardMsg;

  applyAmendment({ node, path }, doc, params);
  return finalizeAmend(doc);
}

async function bulkGateFailures(
  doc: DodDocument,
  params: AmendParams,
  leaves: ReturnType<typeof flattenConcreteLeaves>,
): Promise<string | null> {
  if (params.new_command !== undefined) {
    const osMsg = await rejectMissingTools(params.new_command, doc.cwd);
    if (osMsg) return osMsg;
  }
  for (const { node_path } of leaves) {
    const gateMsg = checkAmendGate(doc.amendments, node_path, params.amend_justification);
    if (gateMsg) return gateMsg;
  }
  return null;
}

async function amendBulk(doc: DodDocument, params: AmendParams): Promise<string> {
  const leaves = flattenConcreteLeaves(doc.roots);
  if (leaves.length === 0) {
    return "ERROR: no concrete leaves to amend. Refine drafts first.";
  }

  const blockMsg = await bulkGateFailures(doc, params, leaves);
  if (blockMsg) return blockMsg;

  for (const { node, node_path } of leaves) {
    applyAmendment({ node, path: node_path }, doc, params);
  }
  return finalizeAmend(doc);
}

/** The fields an amendment can move, for both sides of the audit entry. */
function snapshot(node: TaskNode) {
  return { command: node.command, predicate: node.predicate, description: node.description, title: node.title };
}

function applyAmendment(target: { node: TaskNode; path: string }, doc: DodDocument, params: AmendParams): void {
  const { node, path } = target;
  const old_value = snapshot(node);
  if (params.new_command !== undefined) node.command = params.new_command;
  if (params.new_predicate !== undefined) node.predicate = params.new_predicate;
  if (params.new_description !== undefined) node.description = params.new_description;
  if (params.new_title !== undefined) node.title = params.new_title;
  node.last_status = "pending";

  doc.amendments.push({
    timestamp: new Date().toISOString(),
    node_path: path,
    action: "modified",
    old_value,
    new_value: snapshot(node),
    reason: params.reason,
    justification: params.amend_justification,
  });
}

async function finalizeAmend(doc: DodDocument): Promise<string> {
  doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;
  await store.save(doc);
  await writeMarkdown(doc);
  return "Proof amended and logged.\nStatus reset to pending. Run dod_check to re-verify.";
}

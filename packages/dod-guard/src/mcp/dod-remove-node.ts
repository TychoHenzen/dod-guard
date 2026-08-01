/**
 * dod_remove_node adapter. Removal works the same at any depth: locate the
 * parent array and index the path names, then splice once.
 */
import { writeMarkdown } from "../author.js";
import { computeProofFingerprint } from "../fingerprint.js";
import * as store from "../store.js";
import { findNodeById } from "../tree-utils.js";
import type { DodDocument, TaskNode } from "../types.js";
import { locateInArray } from "./locate-node.js";
import { isDocError, resolveDoc } from "./resolve.js";

interface RemoveParams {
  dod_id: string;
  node_path: string;
  node_id?: string;
}

export async function handleDodRemoveNode(params: RemoveParams): Promise<string> {
  const resolved = await resolveDoc(params.dod_id);
  if (isDocError(resolved)) return resolved;
  const doc = resolved;

  const pathResult = resolveNodePath(doc, params);
  if (typeof pathResult !== "string") return pathResult.error;
  const nodePath = pathResult;

  const loc = locateInArray(doc.roots, nodePath);
  if ("error" in loc) return loc.error;

  const [removed] = loc.arr.splice(loc.idx, 1);
  recordRemoval(doc, nodePath, removed);
  doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;
  await store.save(doc);
  await writeMarkdown(doc);

  const label = nodePath.includes(".") ? "node" : "root node";
  return `Removed ${label} "${removed.title}" (${removed.refinement}) and all descendants.`;
}

function resolveNodePath(doc: DodDocument, params: RemoveParams): string | { error: string } {
  if (!params.node_id) return params.node_path;
  const found = findNodeById(doc.roots, params.node_id);
  if (!found) return { error: `ERROR: node not found by id "${params.node_id}".` };
  return found.path;
}

function recordRemoval(doc: DodDocument, nodePath: string, removed: TaskNode): void {
  doc.amendments.push({
    timestamp: new Date().toISOString(),
    node_path: nodePath,
    action: "removed",
    old_value: { title: removed.title, refinement: removed.refinement },
    reason: `Removed node "${removed.title}"`,
  });
}

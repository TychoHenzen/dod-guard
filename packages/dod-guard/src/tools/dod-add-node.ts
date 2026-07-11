/**
 * dod_add_node — Add a new TaskNode (draft or concrete) to a DoD tree.
 */

import { writeMarkdown } from "../author.js";
import { computeProofFingerprint, findNodeByPath, isExecutablePredicate } from "../checker.js";
import { findMissingTools } from "../command-check.js";
import * as store from "../store.js";
import { formatMissingTools } from "../tree-utils.js";
import type { Predicate, ProofCategory, TaskNode } from "../types.js";

interface AddNodeParams {
  dod_id: string;
  parent_path: string;
  title: string;
  refinement: "draft" | "concrete";
  intent?: string;
  command?: string;
  predicate?: Predicate;
  description?: string;
  category?: ProofCategory;
  advisory?: boolean;
}

export async function handleDodAddNode(params: AddNodeParams): Promise<{ path: string; message: string }> {
  const { dod_id, parent_path, title, refinement, intent, command, predicate, description, category, advisory } =
    params;

  const doc = await store.load(dod_id);
  if (!doc) throw new Error("ERROR: DoD not found.");

  let parent: TaskNode | null = null;
  if (parent_path) {
    parent = findNodeByPath(doc.roots, parent_path);
    if (!parent) throw new Error(`ERROR: parent node not found at path "${parent_path}".`);
    if (!parent.children)
      throw new Error(`ERROR: parent "${parent.title}" is a leaf — cannot add children. Add to a task group.`);
  }

  // Validate concrete node
  if (refinement === "concrete") {
    if (!(command && predicate && description)) {
      throw new Error("ERROR: concrete nodes require command, predicate, and description.");
    }
    const pred = predicate as Predicate;
    if (isExecutablePredicate(pred.type) && command.trim() !== "") {
      const missing = await findMissingTools([command], doc.cwd);
      if (missing.length > 0) {
        throw new Error(formatMissingTools(missing));
      }
    }
  }

  if (refinement === "draft" && !intent) {
    throw new Error("ERROR: draft nodes require an intent describing what this will prove.");
  }

  const node: TaskNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    refinement,
    last_status: refinement === "draft" ? "draft" : "pending",
  };

  if (refinement === "draft") node.intent = intent;
  if (refinement === "concrete") {
    node.command = command;
    node.predicate = predicate as Predicate;
    node.description = description;
    node.category = category as ProofCategory | undefined;
    if (advisory !== undefined) node.advisory = advisory;
    else if (predicate?.type === "regression") node.advisory = true;
    if (predicate?.type === "regression" && node.category === "coverage" && predicate.lower_is_better === undefined) {
      (node.predicate as Predicate).lower_is_better = false;
    }
  }

  if (parent) {
    parent.children?.push(node);
  } else {
    doc.roots.push(node);
  }

  const fullPath = parent_path
    ? `${parent_path}.children.${(parent?.children?.length ?? 0) - 1}`
    : `${doc.roots.length - 1}`;

  doc.amendments.push({
    timestamp: new Date().toISOString(),
    node_path: fullPath,
    action: "added",
    new_value: { title, refinement },
    reason: `Added ${refinement} node: ${title}`,
  });

  doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

  await store.save(doc);
  await writeMarkdown(doc);

  return {
    path: fullPath,
    message: `Node "${title}" (${refinement}) added at path "${fullPath}".\nRun dod_check to verify${refinement === "draft" ? " after refining with dod_refine" : ""}.`,
  };
}

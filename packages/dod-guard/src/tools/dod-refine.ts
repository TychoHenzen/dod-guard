/**
 * dod_refine — Refine a draft TaskNode into concrete or subdivide into children.
 */

import { writeMarkdown } from "../author.js";
import { countDraftNodes, findNodeByPath, isExecutablePredicate } from "../checker.js";
import { findMissingTools, isPlaceholderCommand } from "../command-check.js";
import { computeProofFingerprint } from "../fingerprint.js";
import * as store from "../store.js";
import { findNodeById, formatMissingTools } from "../tree-utils.js";
import type { Predicate, ProofCategory, TaskNode } from "../types.js";

interface RefineParams {
  dod_id: string;
  node_path: string;
  node_id?: string;
  mode: "concretize" | "subdivide";
  command?: string;
  predicate?: Predicate;
  description?: string;
  category?: ProofCategory;
  advisory?: boolean;
  children?: { title: string; intent: string }[];
}

export async function handleDodRefine(params: RefineParams): Promise<string> {
  const {
    dod_id,
    node_path: nodePath,
    node_id: nodeId,
    mode,
    command,
    predicate,
    description,
    category,
    advisory,
    children,
  } = params;

  const doc = await store.load(dod_id);
  if (!doc) return "ERROR: DoD not found.";

  // Resolve node — node_id takes precedence (stable across tree mutations)
  let resolvedPath = nodePath;
  let node: TaskNode | null = null;
  if (nodeId) {
    const found = findNodeById(doc.roots, nodeId);
    if (!found) return `ERROR: node not found by id "${nodeId}".`;
    node = found.node;
    resolvedPath = found.path;
  } else {
    node = findNodeByPath(doc.roots, nodePath);
  }

  if (!node) return `ERROR: node not found at path "${nodePath}".`;
  if (node.refinement !== "draft") return `ERROR: node "${node.title}" is already concrete. Use dod_amend to modify.`;
  if (node.children && node.children.length > 0)
    return `ERROR: node "${node.title}" is a task group with children — not a leaf. Refine its children instead.`;

  const oldIntent = node.intent;
  let placeholderWarn: string[] = [];

  if (mode === "concretize") {
    if (!(command && predicate)) {
      return "ERROR: concretize mode requires command and predicate.";
    }

    const pred = predicate as Predicate;
    if (isExecutablePredicate(pred.type) && command.trim() !== "") {
      const missing = await findMissingTools([command], doc.cwd);
      if (missing.length > 0) {
        return formatMissingTools(missing);
      }
    }

    node.refinement = "concrete";
    node.command = command;
    node.predicate = pred;
    node.description = description ?? "";
    if (category) node.category = category as ProofCategory;
    if (advisory !== undefined) node.advisory = advisory;
    node.intent = undefined;
    node.last_status = "pending";

    doc.amendments.push({
      timestamp: new Date().toISOString(),
      node_path: resolvedPath,
      action: "refined",
      old_value: { refinement: "draft", intent: oldIntent },
      new_value: { refinement: "concrete", command, predicate: { ...pred }, description: description ?? "" },
      reason: `Refined draft → concrete: ${description ?? ""}`,
    });

    placeholderWarn = isPlaceholderCommand(command ?? "")
      ? [
          "",
          "⚠️  PLACEHOLDER PROOF: This command always exits 0 — it provides zero verification.",
          "The proof will pass dod_check regardless of whether the code actually works.",
          "Replace with a real verification command before considering this DoD complete.",
        ]
      : [];
  } else {
    // subdivide mode
    if (!children || children.length === 0) {
      return "ERROR: subdivide mode requires at least one child in children array.";
    }

    const childNodes: TaskNode[] = children.map((c) => {
      const childId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 4)}`;
      return {
        id: childId,
        title: c.title,
        refinement: "draft" as const,
        intent: c.intent,
        last_status: "draft" as const,
      };
    });

    node.children = childNodes;
    node.refinement = "concrete";
    node.intent = undefined;
    delete (node as Partial<TaskNode>).command;
    delete (node as Partial<TaskNode>).predicate;
    delete (node as Partial<TaskNode>).description;
    delete (node as Partial<TaskNode>).category;

    doc.amendments.push({
      timestamp: new Date().toISOString(),
      node_path: resolvedPath,
      action: "refined",
      old_value: { refinement: "draft", intent: oldIntent },
      new_value: { refinement: "concrete", children: childNodes },
      reason: `Subdivided into ${children.length} child draft nodes`,
    });
  }

  const draftCount = countDraftNodes(doc.roots);

  doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

  await store.save(doc);
  await writeMarkdown(doc);

  const msg =
    mode === "concretize"
      ? [
          `Node refined: "${node.title}" is now concrete.`,
          `Command: \`${command}\``,
          `Predicate: ${(predicate as Predicate).type}:${(predicate as Predicate).value ?? "(no value)"}`,
          `Description: ${description}`,
          ...placeholderWarn,
          draftCount === 0
            ? "\n🎉 All nodes are now concrete — the DoD is fully verifiable. Run dod_check."
            : `\n${draftCount} draft node(s) remaining.`,
        ].join("\n")
      : [
          `Node subdivided: "${node.title}" is now a task group with ${children?.length} child draft(s).`,
          `Children: ${children?.map((c) => `"${c.title}"`).join(", ")}`,
          `\n${draftCount} draft node(s) total. Refine each draft leaf before running dod_check.`,
        ].join("\n");

  return msg;
}

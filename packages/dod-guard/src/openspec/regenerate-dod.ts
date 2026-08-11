/**
 * Regenerate a DoD from an edited spec without weakening the tamper
 * fingerprint. `computeProofFingerprint` hashes every concrete leaf's
 * command/predicate/category/advisory - see `fingerprint.ts`. A naive
 * "regenerate the whole tree and re-import" would reset every leaf's
 * fingerprint contribution, hiding a real hand-edit that happened to land
 * next to a legitimate spec change.
 *
 * Instead this diffs the freshly converted tree against the stored one at
 * the leaf level, keyed on the requirement heading plus the scenario
 * heading - see `scenario-identity.ts` for why that key has to be tracked
 * in a sidecar rather than read back off the stored leaf. A leaf whose
 * *source text* (the scenario's THEN text - `description` for a concrete
 * leaf, `intent` minus its `MANUAL: ` prefix for a draft leaf) is
 * unchanged is left alone: same node, same id, same command, same
 * recorded verdict. Only a leaf whose source text changed goes through
 * `dod_amend`, which recomputes the document-wide fingerprint itself. New
 * scenarios arrive through `dod_add_node`; removed ones leave through
 * `dod_remove_node`. Both also recompute the fingerprint. The one direct
 * write is `ensureGroupId`, which recomputes `proof_fingerprint` after
 * pushing an empty draft group. That recompute cannot move the hash: an
 * empty group has no children and is not concrete, so
 * `flattenConcreteLeaves` never collects it. The stored hash stays exactly
 * as strong as it is for a hand-made amendment.
 */
import { randomUUID } from "node:crypto";
import { writeMarkdown } from "../author.js";
import { findNodeByPath } from "../checker.js";
import { computeProofFingerprint } from "../fingerprint.js";
import { handleDodAmend } from "../mcp/dod-amend.js";
import { handleDodRemoveNode } from "../mcp/dod-remove-node.js";
import * as store from "../store.js";
import { handleDodAddNode } from "../tools/dod-add-node.js";
import { findNodeById } from "../tree-utils.js";
import type { TaskNode } from "../types.js";
import { convertInstructionsToDod } from "./convert.js";
import { readScenarioMap, type ScenarioMapEntry, scenarioKey, writeScenarioMap } from "./scenario-identity.js";
import type { OpenSpecInstructions } from "./types.js";

interface RegenerateSummary {
  amended: string[];
  added: string[];
  removed: string[];
  unchanged: number;
}

/** The scenario THEN text a leaf was built from, as `convert.ts` stored
 * it: verbatim in `description` for a concrete leaf, under a `MANUAL: `
 * prefix in `intent` for a draft leaf. */
function sourceText(node: TaskNode): string {
  if (node.refinement === "concrete") return node.description ?? "";
  return (node.intent ?? "").replace(/^MANUAL:\s*/, "");
}

function findGroupByTitle(roots: TaskNode[], title: string): TaskNode | undefined {
  return roots.find((n) => n.title === title && n.children);
}

function addNodeParams(dodId: string, parentId: string, leaf: TaskNode) {
  return {
    dod_id: dodId,
    parent_path: "",
    parent_id: parentId,
    title: leaf.title,
    refinement: leaf.refinement,
    intent: leaf.intent,
    command: leaf.command,
    predicate: leaf.predicate,
    description: leaf.description,
    category: leaf.category,
    advisory: leaf.advisory,
  };
}

async function loadDocOrThrow(dodId: string) {
  const doc = await store.load(dodId);
  if (!doc) throw new Error(`ERROR: DoD "${dodId}" not found.`);
  return doc;
}

/** A brand-new requirement heading, or a new scenario under a heading
 * that already exists - `dod_add_node` only builds leaves, so an absent
 * group is created directly here, the same way `dod_add_node` itself
 * mutates the store (push, audit entry, fingerprint recompute, save). */
async function ensureGroupId(dodId: string, groupTitle: string): Promise<string> {
  const doc = await loadDocOrThrow(dodId);
  const existing = findGroupByTitle(doc.roots, groupTitle);
  if (existing) return existing.id;

  const group: TaskNode = {
    id: `group-${randomUUID()}`,
    title: groupTitle,
    refinement: "draft",
    children: [],
    last_status: "draft",
  };
  doc.roots.push(group);
  doc.amendments.push({
    timestamp: new Date().toISOString(),
    node_path: `${doc.roots.length - 1}`,
    action: "added",
    new_value: { title: group.title, refinement: group.refinement },
    reason: `Added requirement group: ${group.title}`,
  });
  doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;
  await store.save(doc);
  await writeMarkdown(doc);
  return group.id;
}

async function addLeafGetId(dodId: string, parentId: string, leaf: TaskNode): Promise<string> {
  const { path } = await handleDodAddNode(addNodeParams(dodId, parentId, leaf));
  const doc = await loadDocOrThrow(dodId);
  const node = findNodeByPath(doc.roots, path);
  if (!node) throw new Error(`ERROR: added node not found at path "${path}".`);
  return node.id;
}

async function amendChangedLeaf(dodId: string, oldLeaf: TaskNode, newLeaf: TaskNode): Promise<void> {
  const res = await handleDodAmend({
    dod_id: dodId,
    node_path: "",
    node_id: oldLeaf.id,
    new_command: newLeaf.command,
    new_predicate: newLeaf.predicate,
    new_description: newLeaf.description,
    reason: "Regenerated: scenario text changed",
  });
  if (res.startsWith("ERROR")) throw new Error(res);
}

/** A draft leaf's text carries no weight in the fingerprint (only concrete
 * leaves are hashed - see `fingerprint.ts`), and `dod_amend` refuses a
 * draft target outright. Mutate it in place, with its own audit entry, so
 * a regeneration still leaves a trail without pretending this is a
 * proof-strength change. */
async function mutateDraftText(dodId: string, nodeId: string, newIntent: string): Promise<void> {
  const doc = await loadDocOrThrow(dodId);
  const found = findNodeById(doc.roots, nodeId);
  if (!found) throw new Error(`ERROR: node not found by id "${nodeId}".`);

  const old_value = { intent: found.node.intent };
  found.node.intent = newIntent;
  doc.amendments.push({
    timestamp: new Date().toISOString(),
    node_path: found.path,
    action: "modified",
    old_value,
    new_value: { intent: newIntent },
    reason: "Regenerated: scenario text changed",
  });

  await store.save(doc);
  await writeMarkdown(doc);
}

async function reconcileExisting(
  dodId: string,
  groupTitle: string,
  oldLeaf: TaskNode,
  newLeaf: TaskNode,
  summary: RegenerateSummary,
): Promise<string> {
  if (sourceText(oldLeaf) === sourceText(newLeaf) && oldLeaf.refinement === newLeaf.refinement) {
    summary.unchanged++;
    return oldLeaf.id;
  }
  if (oldLeaf.refinement === "concrete" && newLeaf.refinement === "concrete") {
    await amendChangedLeaf(dodId, oldLeaf, newLeaf);
    summary.amended.push(oldLeaf.id);
    return oldLeaf.id;
  }
  if (oldLeaf.refinement === "draft" && newLeaf.refinement === "draft") {
    await mutateDraftText(dodId, oldLeaf.id, newLeaf.intent ?? "");
    summary.amended.push(oldLeaf.id);
    return oldLeaf.id;
  }
  // The scenario went from checkable to not (or back) - the leaf's kind
  // itself changed, which amend can't express. Replace it.
  await handleDodRemoveNode({ dod_id: dodId, node_path: "", node_id: oldLeaf.id });
  const parentId = await ensureGroupId(dodId, groupTitle);
  const id = await addLeafGetId(dodId, parentId, newLeaf);
  summary.removed.push(oldLeaf.id);
  summary.added.push(id);
  return id;
}

async function reconcileScenario(
  dodId: string,
  groupTitle: string,
  newLeaf: TaskNode,
  priorNodeId: string | undefined,
  summary: RegenerateSummary,
): Promise<string> {
  if (priorNodeId) {
    const doc = await loadDocOrThrow(dodId);
    const found = findNodeById(doc.roots, priorNodeId);
    if (found) return reconcileExisting(dodId, groupTitle, found.node, newLeaf, summary);
  }
  const parentId = await ensureGroupId(dodId, groupTitle);
  const id = await addLeafGetId(dodId, parentId, newLeaf);
  summary.added.push(id);
  return id;
}

async function removeIfPresent(dodId: string, nodeId: string, summary: RegenerateSummary): Promise<void> {
  const doc = await loadDocOrThrow(dodId);
  if (!findNodeById(doc.roots, nodeId)) return;
  await handleDodRemoveNode({ dod_id: dodId, node_path: "", node_id: nodeId });
  summary.removed.push(nodeId);
}

async function reconcileAll(
  dodId: string,
  newRoots: TaskNode[],
  priorById: Map<string, string>,
  summary: RegenerateSummary,
): Promise<{ nextMap: ScenarioMapEntry[]; seenKeys: Set<string> }> {
  const nextMap: ScenarioMapEntry[] = [];
  const seenKeys = new Set<string>();

  for (const newGroup of newRoots) {
    for (const newLeaf of newGroup.children ?? []) {
      const key = scenarioKey(newGroup.title, newLeaf.title);
      seenKeys.add(key);
      const nodeId = await reconcileScenario(dodId, newGroup.title, newLeaf, priorById.get(key), summary);
      nextMap.push({ groupTitle: newGroup.title, scenarioTitle: newLeaf.title, nodeId });
    }
  }
  return { nextMap, seenKeys };
}

/**
 * Regenerate `dodId` from `instructions`' current spec deltas, leaving
 * every leaf whose driving scenario text is unchanged untouched (command,
 * predicate, recorded verdict, and its share of the fingerprint all
 * survive), and routing every real change through the same
 * amend/add/remove paths a human would use one leaf at a time.
 */
export async function regenerateDod(dodId: string, instructions: OpenSpecInstructions): Promise<RegenerateSummary> {
  await loadDocOrThrow(dodId); // fail fast if the id is unknown

  const converted = await convertInstructionsToDod(instructions);
  const priorMap = await readScenarioMap(instructions.resolvedOutputPath);
  const priorById = new Map(priorMap.map((e) => [scenarioKey(e.groupTitle, e.scenarioTitle), e.nodeId]));

  const summary: RegenerateSummary = { amended: [], added: [], removed: [], unchanged: 0 };
  const { nextMap, seenKeys } = await reconcileAll(dodId, converted.roots, priorById, summary);

  for (const entry of priorMap) {
    if (!seenKeys.has(scenarioKey(entry.groupTitle, entry.scenarioTitle))) {
      await removeIfPresent(dodId, entry.nodeId, summary);
    }
  }

  await writeScenarioMap(instructions.resolvedOutputPath, nextMap);
  return summary;
}

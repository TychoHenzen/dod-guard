// Executes in-scope concrete leaves and carries forward the rest.
import { countNodeAmendments } from "./checker-tree.js";
import { executeProof } from "./evaluate-proof.js";
import { flattenConcreteLeaves } from "./fingerprint.js";
import type {
  AdversarialGate,
  Amendment,
  LeafResult,
  TaskNode,
} from "./types.js";

export interface ConcreteEntry {
  node: TaskNode;
  node_path: string;
  result: LeafResult;
}

function isInScope(path: string, nodePath?: string): boolean {
  if (nodePath === undefined) return true;
  return path === nodePath || path.startsWith(`${nodePath}.`);
}

function toCarriedStatus(status: TaskNode["last_status"]): LeafResult["status"] {
  if (status === "pending" || status === "draft") return "skipped";
  return status;
}

function carryForward(node: TaskNode, node_path: string): LeafResult {
  return {
    node_path,
    id: node.id,
    title: node.title,
    description: node.description ?? node.intent ?? node.title,
    status: toCarriedStatus(node.last_status),
    command: node.command ?? "",
    output: node.last_output,
  };
}

async function runOne(
  node: TaskNode,
  node_path: string,
  cwd: string,
  amendments: Amendment[],
  adversarialGates: AdversarialGate[],
): Promise<LeafResult> {
  node.amend_count = countNodeAmendments(amendments, node_path);
  const opts = { adversarial_gates: adversarialGates };
  const result = await executeProof(node, cwd, opts);
  result.node_path = node_path;
  result.description = node.description ?? node.intent ?? node.title;
  return result;
}

export async function runConcreteLeaves(
  roots: TaskNode[],
  cwd: string,
  amendments: Amendment[],
  adversarialGates: AdversarialGate[],
  nodePath?: string,
): Promise<ConcreteEntry[]> {
  const leaves = flattenConcreteLeaves(roots);
  const entries: ConcreteEntry[] = [];
  for (const { node, node_path } of leaves) {
    const result = isInScope(node_path, nodePath)
      ? await runOne(node, node_path, cwd, amendments, adversarialGates)
      : carryForward(node, node_path);
    entries.push({ node, node_path, result });
  }
  return entries;
}

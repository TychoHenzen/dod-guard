// Small, pure tree predicates shared by checker.ts and tree-utils.ts.
import type { Amendment, TaskNode } from "./types.js";

function isLeaf(node: TaskNode): boolean {
  return !node.children || node.children.length === 0;
}

export function hasDraftNodes(nodes: TaskNode[]): boolean {
  return nodes.some((node) => (isLeaf(node) ? node.refinement === "draft" : hasDraftNodes(node.children ?? [])));
}

export function isBranchLocked(nodes: TaskNode[]): boolean {
  return !hasDraftNodes(nodes);
}

export function countDraftNodes(nodes: TaskNode[]): number {
  return nodes.reduce((sum, node) => {
    if (isLeaf(node)) return sum + (node.refinement === "draft" ? 1 : 0);
    return sum + countDraftNodes(node.children ?? []);
  }, 0);
}

function toIndex(segment: string): number | null {
  const idx = Number(segment);
  return Number.isInteger(idx) ? idx : null;
}

export function findNodeByPath(nodes: TaskNode[], path: string): TaskNode | null {
  if (!path) return null;
  const segments = path.split(".").filter((s) => s !== "children");

  let current: TaskNode[] | undefined = nodes;
  let node: TaskNode | null = null;
  for (const segment of segments) {
    const idx = toIndex(segment);
    if (idx === null || !current || idx < 0 || idx >= current.length) return null;
    node = current[idx];
    current = node.children;
  }
  return node;
}

export function countNodeAmendments(amendments: Amendment[], nodePath: string): number {
  return amendments.filter((a) => a.node_path === nodePath && (a.action === "modified" || a.action === "refined"))
    .length;
}

export function checkAmendGate(
  amendments: Amendment[],
  resolvedPath: string,
  amendJustification?: string,
): string | null {
  const count = countNodeAmendments(amendments, resolvedPath);
  if (count < 3 || amendJustification) return null;
  return (
    `This node has been amended ${count} times. ` +
    "Provide amend_justification explaining why further amendments are needed."
  );
}

export interface PathedNode {
  node: TaskNode;
  node_path: string;
}

/** Every draft leaf in the tree, with its dot-separated path. */
export function collectDraftLeaves(nodes: TaskNode[], parentPath?: string): PathedNode[] {
  const out: PathedNode[] = [];
  nodes.forEach((node, i) => {
    const path = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (!isLeaf(node)) {
      out.push(...collectDraftLeaves(node.children ?? [], path));
    } else if (node.refinement === "draft") {
      out.push({ node, node_path: path });
    }
  });
  return out;
}

import { createHash } from "node:crypto";
import type { TaskNode } from "./types.js";

// ── Tree utilities ────────────────────────────────────────────────────────

function flattenLeaf(node: TaskNode, index: number, parentPath?: string): { node: TaskNode; node_path: string }[] {
  const currentPath = parentPath ? `${parentPath}.children.${index}` : `${index}`;
  if (node.children && node.children.length > 0) {
    return flattenConcreteLeaves(node.children, currentPath);
  }
  if (node.refinement === "concrete") {
    return [{ node, node_path: currentPath }];
  }
  return [];
}

export function flattenConcreteLeaves(nodes: TaskNode[], parentPath?: string): { node: TaskNode; node_path: string }[] {
  const results: { node: TaskNode; node_path: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    results.push(...flattenLeaf(nodes[i], i, parentPath));
  }
  return results;
}

// ── Proof-set fingerprint ─────────────────────────────────────────────────

/**
 * Canonical proof-set fingerprint for tamper detection.
 * Hashes every concrete leaf's strength-bearing fields in fixed order,
 * sorted by node ID for deterministic ordering.
 */
export function computeProofFingerprint(roots: TaskNode[]): string {
  const leaves = flattenConcreteLeaves(roots);
  if (leaves.length === 0) return "";

  const sorted = leaves.slice().sort((a, b) => a.node.id.localeCompare(b.node.id));

  const data = sorted
    .map(({ node }) => {
      const parts: string[] = [];

      parts.push(node.command ?? "");
      parts.push(node.predicate?.type ?? "");
      parts.push(node.predicate?.value !== undefined ? String(node.predicate.value) : "");

      if (node.predicate?.timeout_ms !== undefined) {
        parts.push(`timeout_ms:${node.predicate.timeout_ms}`);
      }
      if (node.category !== undefined) {
        parts.push(`category:${node.category}`);
      }
      if (node.advisory !== undefined) {
        parts.push(`adv:${node.advisory}`);
      }

      return parts.join("|");
    })
    .join("\n");

  return createHash("sha256").update(data).digest("hex");
}

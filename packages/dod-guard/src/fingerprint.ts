import { createHash } from "node:crypto";
import type { TaskNode } from "./types.js";

// ── Tree utilities (moved from checker.ts) ──────────────────────────

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

/**
 * Walk the TaskNode tree depth-first, collecting every concrete leaf
 * (refinement === "concrete", no children) with its dot-separated path.
 * Draft leaves and task groups are excluded.
 */
export function flattenConcreteLeaves(nodes: TaskNode[], parentPath?: string): { node: TaskNode; node_path: string }[] {
  const results: { node: TaskNode; node_path: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    results.push(...flattenLeaf(nodes[i], i, parentPath));
  }
  return results;
}

// ── Proof-set fingerprint (canonical implementation) ────────────────

/**
 * Canonical proof-set fingerprint for tamper detection.
 * Hashes every concrete leaf's strength-bearing fields in fixed order,
 * sorted by node ID for deterministic ordering. Returns full SHA-256
 * hex digest (no truncation). Draft nodes are excluded.
 */
export function computeProofFingerprint(roots: TaskNode[]): string {
  const leaves = flattenConcreteLeaves(roots);
  if (leaves.length === 0) return "";

  // Sort by node ID for deterministic ordering across tree mutations
  const sorted = leaves.slice().sort((a, b) => a.node.id.localeCompare(b.node.id));

  const data = sorted
    .map(({ node }) => {
      const parts: string[] = [];

      // Always-present fields
      parts.push(node.command ?? "");
      parts.push(node.predicate?.type ?? "");
      parts.push(node.predicate?.value !== undefined ? String(node.predicate.value) : "");

      // Conditional fields — only include if defined
      if (node.predicate?.timeout_ms !== undefined) {
        parts.push(`timeout_ms:${node.predicate.timeout_ms}`);
      }
      if (node.predicate?.extract !== undefined) {
        parts.push(`extract:${node.predicate.extract}`);
      }
      if (node.category !== undefined) {
        parts.push(`category:${node.category}`);
      }
      if (node.predicate?.min_replacement_ratio !== undefined) {
        parts.push(`min_replacement_ratio:${node.predicate.min_replacement_ratio}`);
      }
      if (node.predicate?.max_function_lines !== undefined) {
        parts.push(`max_function_lines:${node.predicate.max_function_lines}`);
      }
      if (node.predicate?.max_file_lines !== undefined) {
        parts.push(`max_file_lines:${node.predicate.max_file_lines}`);
      }
      if (node.predicate?.max_line_length !== undefined) {
        parts.push(`max_line_length:${node.predicate.max_line_length}`);
      }
      if (node.predicate?.max_complexity !== undefined) {
        parts.push(`max_complexity:${node.predicate.max_complexity}`);
      }
      if (node.baseline_value !== undefined) {
        parts.push(`baseline_value:${node.baseline_value}`);
      }

      // Conditional with key shorthand
      if (node.predicate?.lower_is_better !== undefined) {
        parts.push(`lib:${node.predicate.lower_is_better}`);
      }
      if (node.advisory !== undefined) {
        parts.push(`adv:${node.advisory}`);
      }

      return parts.join("|");
    })
    .join("\n");

  return createHash("sha256").update(data).digest("hex");
}

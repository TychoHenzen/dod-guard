/**
 * Locate the parent array and index for a node path, without mutating
 * anything. Shared by adapters that need to splice a specific node.
 */
import type { TaskNode } from "../types.js";

type Location = { arr: TaskNode[]; idx: number } | { error: string };

export function locateInArray(roots: TaskNode[], nodePath: string): Location {
  const parts = nodePath.split(".");
  const rootIdx = Number(parts[0]);
  if (!Number.isInteger(rootIdx) || rootIdx < 0 || rootIdx >= roots.length) {
    return { error: `ERROR: root index ${parts[0]} out of range (0-${roots.length - 1}).` };
  }

  let loc = { arr: roots, idx: rootIdx };
  for (let i = 1; i < parts.length; i += 2) {
    const stepped = stepInto(loc, parts, i);
    if ("error" in stepped) return stepped;
    loc = stepped;
  }
  return loc;
}

function stepInto(loc: { arr: TaskNode[]; idx: number }, parts: string[], i: number): Location {
  if (parts[i] !== "children") return { error: `ERROR: invalid node path.` };
  const children = loc.arr[loc.idx]?.children;
  if (!children) return { error: `ERROR: invalid node path.` };
  const nextIdx = Number(parts[i + 1]);
  if (!Number.isInteger(nextIdx) || nextIdx < 0 || nextIdx >= children.length) {
    return { error: `ERROR: node index ${parts[i + 1]} out of range.` };
  }
  return { arr: children, idx: nextIdx };
}

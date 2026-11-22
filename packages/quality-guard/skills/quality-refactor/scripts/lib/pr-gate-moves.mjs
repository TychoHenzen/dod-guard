import { findingKey, groupBy } from "./pr-gate-key.mjs";

// A finding that left one changed file and appeared in another with the
// same key is moved code, not new debt.
export function absorbMoves(total) {
  const pool = groupBy(total.resolved, findingKey);
  // pop() both tests for a leftover fixed finding with this key and uses it.
  const isMoved = (finding) =>
    pool.get(findingKey(finding))?.pop() !== undefined;
  const fresh = [];
  const moved = [];
  for (const finding of total.fresh)
    (isMoved(finding) ? moved : fresh).push(finding);
  return { ...total, fresh, moved, resolved: [...pool.values()].flat() };
}

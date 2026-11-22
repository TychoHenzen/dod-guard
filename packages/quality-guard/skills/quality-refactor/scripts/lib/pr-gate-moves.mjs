import { findingKey, groupBy } from "./pr-gate-key.mjs";

// line-length and file-length messages carry only a measure. Without an
// enclosing function, equal keys say nothing about identity.
const SUBJECTLESS_RULES = new Set(["line-length", "file-length"]);

const hasIdentity = (finding) =>
  Boolean(finding.symbol) || !SUBJECTLESS_RULES.has(finding.rule);

// A finding that left one changed file and appeared in another with the
// same key is moved code, not new debt.
export function absorbMoves(total) {
  const pool = groupBy(total.resolved, findingKey);
  // pop() both tests for a leftover fixed finding with this key and uses it.
  const isMoved = (finding) =>
    hasIdentity(finding) && pool.get(findingKey(finding))?.pop() !== undefined;
  const fresh = [];
  const moved = [];
  for (const finding of total.fresh)
    (isMoved(finding) ? moved : fresh).push(finding);
  return { ...total, fresh, moved, resolved: [...pool.values()].flat() };
}

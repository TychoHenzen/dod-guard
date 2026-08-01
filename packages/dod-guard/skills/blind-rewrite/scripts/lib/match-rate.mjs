// Multiset matching. Duplicates match once each, so a repeated candidate item
// only counts as often as the source actually contains it.

function multiset(items) {
  const pool = new Map();
  for (const item of items) {
    pool.set(item, (pool.get(item) ?? 0) + 1);
  }
  return pool;
}

function consume(pool, item) {
  const left = pool.get(item) ?? 0;
  if (left === 0) {
    return false;
  }
  pool.set(item, left - 1);
  return true;
}

export function matchCounts(sourceItems, candidateItems) {
  const pool = multiset(sourceItems);
  let matched = 0;
  for (const item of candidateItems) {
    matched += consume(pool, item) ? 1 : 0;
  }
  return { matched, total: candidateItems.length };
}

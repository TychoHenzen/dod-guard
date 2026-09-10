export function countByFileRule(violations) {
  const counts = {};
  for (const violation of violations) {
    const key = `${violation.file}::${violation.rule}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function sortedUnique(values) {
  return [...new Set(values)].sort();
}

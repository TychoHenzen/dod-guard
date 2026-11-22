// Identity of a finding across revisions, and grouping by it.

/**
 * Line numbers and measured values move; the rule, the enclosing function
 * and the subject of the message do not. `symbol` is empty for a finding
 * outside any function.
 */
export function findingKey(violation) {
  const subject = violation.message.replaceAll(/\d+/g, "#");
  return `${violation.rule}|${violation.symbol ?? ""}|${subject}`;
}

export function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) group.sort((a, b) => a.line - b.line);
  return groups;
}

// Groups items under item[key], keeping the first-seen key order and the input
// order inside each group.
function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    groups.set(item[key], [...(groups.get(item[key]) ?? []), item]);
  }
  return groups;
}

export { groupBy };

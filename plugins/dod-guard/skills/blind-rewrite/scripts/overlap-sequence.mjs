// Sequence views of two token lists for the overlap gate: the longest shared
// contiguous run and how far the shared tokens keep their relative order.
export function longestRun(left, right) {
  let longest = 0;
  let previous = new Array(right.length + 1).fill(0);
  for (const leftToken of left) {
    const current = new Array(right.length + 1).fill(0);
    right.forEach((rightToken, index) => {
      if (leftToken !== rightToken) return;
      current[index + 1] = previous[index] + 1;
      longest = Math.max(longest, current[index + 1]);
    });
    previous = current;
  }
  return longest;
}

function positionsByValue(values) {
  const positions = new Map();
  values.forEach((value, index) => {
    const list = positions.get(value) ?? [];
    list.push(index);
    positions.set(value, list);
  });
  return positions;
}

function lowerBound(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) {
      low = middle + 1;
      continue;
    }
    high = middle;
  }
  return low;
}

function increasingLength(sequence) {
  const tails = [];
  for (const value of sequence) tails[lowerBound(tails, value)] = value;
  return tails.length;
}

export function orderSimilarity(left, right) {
  if (right.length === 0) return 0;
  const positions = positionsByValue(left);
  const sequence = right.flatMap((value) => positions.get(value) ?? []);
  return increasingLength(sequence) / right.length;
}

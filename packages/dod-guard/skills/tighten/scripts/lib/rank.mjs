// Ranking decides what the loop works on, so it has to separate accidental
// complexity from the essential kind. Two ideas do that work.
//
// Rule weight: a long line is formatting. A duplicated block, a dead export, or
// a nested branch is a sign that somebody added a path instead of changing one.
// Only the second kind scores.
//
// Churn: a hard problem produces complex code once, in one stretch of work. An
// accidental knot keeps pulling the work back, one return visit after another.
// Complexity plus return churn is the strongest evidence available without
// reading the file.

const RULE_WEIGHT = {
  complexity: 3,
  "nesting-depth": 3,
  "duplicate-block": 3,
  "dead-export": 3,
  "commented-out-code": 2,
  "unused-local": 2,
  "function-length": 2,
  "test-only-export": 2,
  "unnamed-tuple": 1,
  "stateless-method": 1,
  "else-branch": 1,
  "file-length": 1,
  "types-per-file": 1,
  "param-count": 1,
  "todo-marker": 1,
  "line-length": 0,
};

const ORACLE_BONUS = 1.25;

// A rule with no weight carries no signal about accidental complexity. The
// simplicity gate uses this to decide what a regression is. A rewrite that
// lands a long line has not made the code worse, and Biome fixes that anyway.
export function isSignal(rule) {
  return (RULE_WEIGHT[rule] ?? 0) > 0;
}

export function tangleScore(rules) {
  let total = 0;
  for (const [rule, count] of Object.entries(rules)) {
    total += (RULE_WEIGHT[rule] ?? 0) * count;
  }
  return total;
}

// Sublinear on purpose. One file the work returned to 30 times should outrank a
// quiet one, but it should not own every slot in the ledger forever.
function churnFactor({ returns, fixReturns }) {
  return 1 + Math.log2(1 + returns) + 2 * Math.log2(1 + fixReturns);
}

function scoreCandidate({ rules, churn, hasOracle }) {
  const oracle = hasOracle ? ORACLE_BONUS : 1;
  return tangleScore(rules) * churnFactor(churn) * oracle;
}

function byScoreThenPath(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return left.file.localeCompare(right.file);
}

// Worst first. A zero means nothing here answers to a rewrite. Such a file
// drops out instead of sitting in the ledger as a target the loop never picks.
export function rankCandidates(candidates) {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate) }))
    .filter((candidate) => candidate.score > 0)
    .sort(byScoreThenPath);
}

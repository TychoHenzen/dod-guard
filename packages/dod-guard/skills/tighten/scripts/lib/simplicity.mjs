// A rewrite can be entirely different and still be no better. This module
// answers the second half of that: is the replacement smaller, and did the
// shrinking cost a hard violation somewhere else.
//
// The tradeoff it encodes is that size alone is not enough. Say a rewrite
// halves the weighted score and lands a new error-severity violation. That is
// refused. The loop would otherwise trade a broad tangle for a sharp one and
// call it progress. Weight comes from rank.mjs, so the gate and the ledger
// agree on what counts as complexity worth removing.

import { isSignal, tangleScore } from "./rank.mjs";

function tallyErrors(violations, counts) {
  for (const violation of violations) {
    if (violation.severity !== "error" || !isSignal(violation.rule)) {
      continue;
    }
    counts[violation.rule] = (counts[violation.rule] ?? 0) + 1;
  }
}

// One measurement of a whole side of the rewrite. Several small files and one
// large file with the same weighted score come out equal here. That is what
// lets a split count as a real reduction.
export function aggregate(scan) {
  const errorsByRule = {};
  const files = [];
  let tangle = 0;
  for (const measured of scan.units) {
    tangle += tangleScore(measured.rules);
    files.push(measured.file);
    tallyErrors(measured.items, errorsByRule);
  }
  return { tangle, errorsByRule, files };
}

// Only the replacement's rules can climb, so a rule that vanished needs no
// visit. Sorting by name keeps two runs over one input printing alike.
function climbedRules(start, end) {
  const counts = end.errorsByRule;
  return Object.keys(counts)
    .map((rule) => ({
      rule,
      before: start.errorsByRule[rule] ?? 0,
      after: counts[rule],
    }))
    .filter((climb) => climb.after > climb.before)
    .sort((left, right) => left.rule.localeCompare(right.rule));
}

function fractionRemoved(start, end) {
  if (start === 0) {
    return 0;
  }
  return (start - end) / start;
}

// A scan covering nothing is usually a wrong path, not a rewrite that deleted
// the code. So it outranks the largest fall the arithmetic can report.
function chooseVerdict(state) {
  if (state.measuredNothing) {
    return "empty";
  }
  if (state.climbed) {
    return "regressed";
  }
  return state.clearedBar ? "simpler" : "not-simpler";
}

export function judgeSimplicity(before, after, options = {}) {
  const regressions = climbedRules(before, after);
  const gain = fractionRemoved(before.tangle, after.tangle);
  const verdict = chooseVerdict({
    measuredNothing: after.files.length === 0,
    climbed: regressions.length > 0,
    clearedBar: gain > (options.minGain ?? 0),
  });
  return {
    verdict,
    gain,
    regressions,
    before: before.tangle,
    after: after.tangle,
  };
}

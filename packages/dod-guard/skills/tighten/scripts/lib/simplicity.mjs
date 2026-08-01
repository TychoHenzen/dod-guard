// The overlap gate answers one question: is the new code different from the old
// code. That is not enough for this loop. A model can satisfy it by writing a
// different tangle of the same size. This gate answers the second question: is
// the new code smaller.
//
// Both gates must pass. Difference without reduction is churn. Reduction
// without difference is a cosmetic edit.

import { isSignal, tangleScore } from "./rank.mjs";

// The result may be spread over more files than the original was. Splitting one
// knot into three clear modules is a win, so every score here is a total across
// the whole scan rather than a per-file number.
export function aggregate(scan) {
  const units = scan.units ?? [];
  const errorsByRule = {};
  let tangle = 0;
  for (const unit of units) {
    tangle += tangleScore(unit.rules ?? {});
    for (const item of unit.items ?? []) {
      if (item.severity !== "error" || !isSignal(item.rule)) {
        continue;
      }
      errorsByRule[item.rule] = (errorsByRule[item.rule] ?? 0) + 1;
    }
  }
  return { tangle, errorsByRule, files: units.map((unit) => unit.file) };
}

// Same rule the repository ratchet uses: existing hard violations are allowed,
// adding one is not. A lower total score does not buy a new nesting-depth error.
function findRegressions(before, after) {
  const rules = new Set([
    ...Object.keys(before.errorsByRule),
    ...Object.keys(after.errorsByRule),
  ]);
  const regressions = [];
  for (const rule of [...rules].sort()) {
    const was = before.errorsByRule[rule] ?? 0;
    const now = after.errorsByRule[rule] ?? 0;
    if (now > was) {
      regressions.push({ rule, before: was, after: now });
    }
  }
  return regressions;
}

function gainOf(before, after) {
  if (before.tangle === 0) {
    return 0;
  }
  return (before.tangle - after.tangle) / before.tangle;
}

function verdictOf(after, gain, regressions, minGain) {
  if (after.files.length === 0) {
    return "empty";
  }
  if (regressions.length > 0) {
    return "regressed";
  }
  return gain > minGain ? "simpler" : "not-simpler";
}

// minGain defaults to 0, which asks only for a strict improvement. Nothing has
// measured what a real gain looks like on this repository yet, so a higher bar
// would be a guess. Raise it once the ledger holds accepted results to read.
export function judgeSimplicity(before, after, options = {}) {
  const minGain = options.minGain ?? 0;
  const regressions = findRegressions(before, after);
  const gain = gainOf(before, after);
  return {
    verdict: verdictOf(after, gain, regressions, minGain),
    gain,
    regressions,
    before: before.tangle,
    after: after.tangle,
  };
}

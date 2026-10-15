// Decides a pull request: new findings above the threshold block, and the pull request must also pay down a few
// findings that were already in the files it changes.

import { severityRank } from "./pr-gate-compare.mjs";

const isTopTier = (finding) => severityRank(finding.severity) >= severityRank("medium");

const countTiers = (findings) => ({
  top: findings.filter(isTopTier).length,
  low: findings.filter((finding) => !isTopTier(finding)).length,
});

const noTarget = ({ top, low }) => top === 0 && low === 0;

function quotaMet({ fixed, required, targets }) {
  // `required` is each target capped at what exists, so zero in both tiers means nothing eligible to pay down.
  if (noTarget(targets) || noTarget(required)) return true;
  const meets = (tier) => required[tier] > 0 && fixed[tier] >= required[tier];
  return meets("top") || meets("low");
}

/**
 * The pull request must remove `fixMediumHigh` medium/high findings or `fixLow` low ones that already existed in the
 * files it changes. Each target is capped at what exists, so a clean file never makes the gate unsatisfiable.
 */
function evaluateQuota(classified, { fixMediumHigh, fixLow }) {
  const available = countTiers([...classified.existing, ...classified.moved, ...classified.resolved]);
  const fixed = countTiers(classified.resolved);
  const required = { top: Math.min(fixMediumHigh, available.top), low: Math.min(fixLow, available.low) };
  const targets = { top: fixMediumHigh, low: fixLow };
  return { satisfied: quotaMet({ available, fixed, required, targets }), available, fixed, required, targets };
}

/** A new finding blocks at `blockOn` or above, unless `ruleBlockOn` sets a different threshold for its rule. */
export function evaluateGate(classified, options) {
  const thresholdFor = (finding) => severityRank(options.ruleBlockOn?.[finding.rule] ?? options.blockOn);
  const blocking = classified.fresh.filter((finding) => severityRank(finding.severity) >= thresholdFor(finding));
  const quota = evaluateQuota(classified, options);
  return { blocking, quota, passed: blocking.length === 0 && quota.satisfied };
}

// The code gate and the prose gate measure different things, but they read the
// numbers the same way. This module holds that shared reading, so neither gate
// carries its own copy of the verdict rule.

function isBreached(stats, threshold, minimum) {
  return stats.sample >= minimum && stats.rate > threshold;
}

// Turns per-metric stats into the gate's verdict. A metric over its limit
// breaches. A metric under its minimum sample size reports its value and never
// fails the gate, because a rate over a tiny sample is noise.
export function gradeStats(stats, thresholds, minimums) {
  const metrics = {};
  const samples = {};
  const breached = [];
  for (const key of Object.keys(thresholds)) {
    metrics[key] = stats[key].rate;
    samples[key] = stats[key].sample;
    if (isBreached(stats[key], thresholds[key], minimums[key])) {
      breached.push(key);
    }
  }
  const verdict = breached.length === 0 ? "rewritten" : "cosmetic";
  return { metrics, samples, thresholds, breached, verdict };
}

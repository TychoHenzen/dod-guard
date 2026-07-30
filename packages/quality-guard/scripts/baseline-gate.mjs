/**
 * Verdicts for a single-file scan, decided against the recorded baseline.
 *
 * A file the baseline already knows may not raise the count of any
 * error-severity rule. A file it has never seen has nothing to be worse than.
 * Such a file passes unless a metric goes past a generous ceiling. Its counts
 * then become the bar it must hold from the next write on.
 */

const ERROR_BOUNDS = {
  "line-length": 120,
  "file-length": 300,
  "function-length": 60,
  complexity: 10,
  "param-count": 7,
  "nesting-depth": 5,
};

/** A first draft gets this much room over the hard bound. */
const NEW_FILE_FACTOR = 1.5;

/** A new file passes unless a metric goes past the generous ceiling. */
export function newFileVerdict(violations) {
  const blocking = [];
  for (const violation of violations) {
    const bound = ERROR_BOUNDS[violation.rule];
    if (bound === undefined || typeof violation.metric !== "number") continue;
    const ceiling = Math.round(bound * NEW_FILE_FACTOR);
    if (violation.metric > ceiling) {
      blocking.push(`${violation.file}:${violation.line}: ${violation.message} (new-file ceiling ${ceiling})`);
    }
  }
  return blocking;
}

/** Regressions the comparison found in this one file, rendered for a human. */
export function ratchetVerdict(comparison, relPath, violations) {
  const blocking = [];
  for (const item of comparison.regressions) {
    if (item.file !== relPath) continue;
    const worst = violations.filter((violation) => violation.rule === item.rule).slice(0, 3);
    const detail = worst.map((v) => `  ${v.file}:${v.line}: ${v.message}`).join("\n");
    blocking.push(`${item.rule}: ${item.before} before, ${item.now} now\n${detail}`);
  }
  return blocking;
}

/**
 * Replace every row this file owns with its current counts, and make sure the
 * baseline lists it. Used both to adopt a file the baseline never saw and to
 * raise a tracked file's bar when a sentinel authorises it. Dropping the old
 * rows first matters: a rule that stopped firing must not leave a loose bar
 * behind.
 */
export function rebaselineFile(baseline, violations, relPath) {
  const prefix = `${relPath}::`;
  const counts = {};
  for (const [key, value] of Object.entries(baseline.counts)) {
    if (!key.startsWith(prefix)) counts[key] = value;
  }
  for (const violation of violations) {
    const key = `${violation.file}::${violation.rule}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const files = [...new Set([...baseline.files, relPath])].sort();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { ...baseline, files, total, counts };
}

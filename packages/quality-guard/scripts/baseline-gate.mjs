/**
 * Verdicts for a single-file scan, decided against the recorded baseline.
 *
 * A file the baseline already knows may not raise the count of any
 * error-severity rule. A file without a baseline comparison is checked against
 * the scanner's normal file-local error rules. The hook never records a row.
 */

/** File-local hard bounds, including presence rules such as types-per-file. */
export function absoluteVerdict(violations) {
  return violations
    .filter((violation) => violation.severity === "error")
    .map(
      (violation) =>
        `${findingText(violation, "unknown-file", "unknown-rule")} (file-local hard bound)`,
    );
}

function findingText(violation, fallbackFile, fallbackRule) {
  const {
    file = fallbackFile,
    line = "?",
    severity = "unknown",
    rule = fallbackRule,
    message = "no message",
  } = violation;
  return `${file}:${line} [${severity}] ${rule}: ${message}`;
}

/** Regressions the comparison found in this one file, rendered for a human. */
export function ratchetVerdict(comparison, relPath, violations) {
  const blocking = [];
  for (const item of comparison.regressions) {
    if (item.file !== relPath) continue;
    const worst = violations
      .filter((violation) => violation.rule === item.rule)
      .slice(0, 3);
    const detail = worst
      .map((violation) => `  ${findingText(violation, relPath, item.rule)}`)
      .join("\n");
    blocking.push(
      `${item.rule}: ${item.before} before, ${item.now} now\n${detail}`,
    );
  }
  return blocking;
}

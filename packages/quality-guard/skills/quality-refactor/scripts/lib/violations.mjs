// The one place a rule appends a finding.

/**
 * Append one violation. A `null` severity means the rule is switched off in
 * this profile, so the finding is dropped here rather than at every call site.
 */
export function push(out, file, line, rule, severity, message, metric) {
  if (severity === null) return;
  out.push({ file: file.rel, line, rule, severity, message, metric });
}

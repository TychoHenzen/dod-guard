// The one place a rule appends a finding.

import { suggestionFor } from "./rule-suggestions.mjs";

/**
 * Append one violation. A null severity means the measured value is within
 * the rule's bounds, so the finding is dropped here rather than at every call
 * site.
 */
export function push({
  out,
  file,
  line,
  rule,
  severity,
  message,
  metric,
  suggestion,
}) {
  if (severity === null) return;
  const fix = suggestion ?? suggestionFor(rule);
  out.push({
    file: file.rel,
    line,
    rule,
    severity,
    message,
    metric,
    ...(fix === undefined ? {} : { suggestion: fix }),
  });
}

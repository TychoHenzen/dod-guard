// The one place a rule appends a finding.

import { suggestionFor } from "./rule-suggestions.mjs";

// Optional fields are left off entirely rather than written as undefined, so
// a finding's JSON keys say which extras its rule supplies.
function definedFields(fields) {
  const entries = Object.entries(fields);
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

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
  widthSource,
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
    // widthSource stays out of `message`: the PR gate keys on the message.
    ...definedFields({ suggestion: fix, widthSource }),
  });
}

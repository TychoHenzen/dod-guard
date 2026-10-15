import { severityFor } from "./config.mjs";
import { push } from "./violations.mjs";

const NO_RESOLVER = Object.freeze({ width: null, source: "default" });

// A formatter width W moves the medium bound to W. High stays at the
// configured high bound unless W is wider, so CI's --block-on=high result is
// unchanged for every W at or below that bound.
function lineBounds(config, resolved) {
  const bounds = config.thresholds["line-length"];
  if (!bounds) return null;
  const { width } = resolved;
  if (width === null) {
    return { width: bounds.medium, medium: bounds.medium, high: bounds.high };
  }
  return { width, medium: width, high: Math.max(width, bounds.high) };
}

// A null bound disables that tier, matching severityFor in config.mjs.
const exceeds = (limit, length) => limit !== null && length > limit;

function lineSeverity(bounds, length) {
  if (exceeds(bounds.high, length)) return "high";
  return exceeds(bounds.medium, length) ? "medium" : null;
}

function checkLineLengths({ file, config, out, widthFor }) {
  const resolved = widthFor ? widthFor(file.path ?? file.rel) : NO_RESOLVER;
  const bounds = lineBounds(config, resolved);
  if (bounds === null) return;
  file.lines.forEach((text, index) => {
    push({
      out,
      file,
      line: index + 1,
      rule: "line-length",
      severity: lineSeverity(bounds, text.length),
      message: `line is ${text.length} chars (width ${bounds.width})`,
      metric: text.length,
      widthSource: resolved.source,
    });
  });
}

/**
 * `widthFor` is the scan's formatter-width resolver. Without one, the fixed
 * 80/120 line-length thresholds apply.
 */
export function checkLines({ file, config, out, widthFor }) {
  checkLineLengths({ file, config, out, widthFor });
  const total = file.lines.length;
  push({
    out,
    file,
    line: 1,
    rule: "file-length",
    severity: severityFor(config, "file-length", total),
    message: "file is " + total + " lines",
    metric: total,
  });
}

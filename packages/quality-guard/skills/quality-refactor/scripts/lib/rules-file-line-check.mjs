import { severityFor } from "./config.mjs";
import { push } from "./violations.mjs";

export function checkLines(file, config, out) {
  file.lines.forEach((text, index) => {
    const severity = severityFor(config, "line-length", text.length);
    push({
      out,
      file,
      line: index + 1,
      rule: "line-length",
      severity,
      message: "line is " + text.length + " chars",
      metric: text.length,
    });
  });
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

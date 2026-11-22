import { writeFileSync } from "node:fs";

import { CONFIG_FILE } from "./exclusion-config.mjs";
import { isGenerated } from "./pr-gate-paths.mjs";
import { quotaText } from "./pr-gate-quota.mjs";
import { renderComment, renderReport } from "./pr-gate-report.mjs";

export function writeOutputs(options, summary) {
  if (options.report) writeFileSync(options.report, renderReport(summary));
  if (options.comment)
    writeFileSync(
      options.comment,
      renderComment({ ...summary, link: options.reportLink }),
    );
}

export function reportToConsole(gate, err, out) {
  for (const finding of gate.blocking) {
    err.write(
      `${finding.file}:${finding.line} ${finding.rule}: ${finding.message}\n`,
    );
  }
  if (gate.blocking.length > 0) {
    err.write(
      `quality-pr-gate: ${gate.blocking.length} new finding(s) ` +
        "block this pull request\n",
    );
  }
  if (!gate.quota.satisfied)
    err.write(`quality-pr-gate: ${quotaText(gate.quota)}\n`);
  if (gate.passed)
    out.write(
      `quality-pr-gate: no new blocking findings. ${quotaText(gate.quota)}\n`,
    );
}

export function summarize({ gate, classified, files, base }) {
  return {
    gate,
    classified,
    mergeBase: base.mergeBase.slice(0, 7),
    changedCount: files.length,
    skipped: files
      .filter((file) => isGenerated(file.path, base.excludes))
      .map((file) => file.path),
    settingChanged: files.some(
      (file) => file.path === CONFIG_FILE || file.basePath === CONFIG_FILE,
    ),
  };
}

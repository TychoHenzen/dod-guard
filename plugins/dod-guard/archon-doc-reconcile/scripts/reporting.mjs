// Writing report.md from the verified plan.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, where } from "./claims.mjs";

function skippedLine(skipped) {
  const commits = skipped.map((skip) => `${skip.sha.slice(0, 10)} "${skip.summary}"`);
  return `   - Wording-only commits skipped: ${commits.join(", ")}`;
}

function changeLines(entry, index) {
  const verb = entry.kind === "delete" ? "Deleted" : "Pointed";
  const object =
    entry.kind === "delete" ? `, which contradicts \`${where(entry.survivor)}\`` : ` at \`${where(entry.survivor)}\``;
  const out = [`${index + 1}. ${verb} \`${where(entry.target)}\`${object} (${entry.verdict}).`];
  if (entry.evidence.length > 0) {
    out.push(`   - Evidence: ${entry.evidence.map((quote) => `"${quote}"`).join(" / ")}`);
  }
  const by = entry.settledBy;
  out.push(`   - Age settled by ${by.sha?.slice(0, 10) ?? "unknown"} "${by.summary ?? ""}" (${by.date ?? "no date"}).`);
  if (by.skipped?.length > 0) {
    out.push(skippedLine(by.skipped));
  }
  return out;
}

function undecidedLines(entry, index) {
  const dates = entry.dates ? ` Dates: ${entry.dates.a ?? "none"} / ${entry.dates.b ?? "none"}.` : "";
  const detail = entry.detail ? ` (${entry.detail})` : "";
  return [`${index + 1}. \`${where(entry.a)}\` vs \`${where(entry.b)}\`: ${entry.reason}${detail}.${dates}`];
}

function summaryLine(current, applied) {
  const scan = current.scan ?? {};
  const settings = `Scan threshold ${scan.threshold ?? "?"}, limit ${scan.limit ?? "none"}.`;
  return `${settings} ${current.pairCount} pairs, ${current.judged} judged, ${applied.length} changed.`;
}

export function report({ dir }) {
  const current = readJson(join(dir, "plan.json"));
  const applied = current.applied ?? [];
  const out = [
    "## Doc reconcile",
    "",
    summaryLine(current, applied),
    "",
    "### Changes",
    "",
    ...(applied.length > 0 ? applied.flatMap(changeLines) : ["None."]),
    "",
    "### Undecided",
    "",
    ...(current.undecided.length > 0 ? current.undecided.flatMap(undecidedLines) : ["None."]),
  ];
  for (const entry of current.reverted ?? []) {
    out.push("", `Reverted \`${entry.file}\`: ${entry.reason}.`);
  }
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}

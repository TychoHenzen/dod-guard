// The run's report: line counts, the migration check, the approved cuts and
// the diff between the target and the migrated draft.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_BUFFER, read, readJson } from "./files.mjs";

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return "";
  }
  const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

export function report({ dir, repo, target }) {
  const { approvedCuts } = readJson(join(dir, "approvals.json"));
  const migrated = join(dir, "migrated.md");
  const diff = spawnSync("git", ["diff", "--no-index", "--", target, migrated], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  if (diff.status !== 0 && diff.status !== 1) {
    throw new Error(`git diff --no-index failed: ${diff.stderr}`);
  }
  const lines = (path) => readFileSync(path, "utf8").split(/\r?\n/).length;
  const out = [
    `## Skill migrate: ${target}`,
    "",
    `The migrated draft is ${migrated}. The target is unchanged; ` +
      "land the draft in the skill's source checkout if you accept it.",
    "",
    `- Lines: ${lines(join(repo, target))} before, ${lines(migrated)} after`,
    "- Gates: writer inputs reworded where needed, overlap pass, regression pass, finish-check pass",
    "",
    "### Migration check",
    "",
    "```",
    read(join(dir, "comparison.txt")).trimEnd(),
    "```",
    "",
    "### Approved cuts",
    "",
  ];
  if (approvedCuts.length === 0) {
    out.push("- None.");
  }
  for (const cut of approvedCuts) {
    out.push(`- ${cut.text ?? cut.claim} (reason: ${cut.reason})`);
  }
  const audited = section(read(join(dir, "audit.md")), "### Approved cuts");
  if (audited !== "") {
    out.push("", "The gap audit listed these as approved cuts:", "", audited);
  }
  out.push("", "### Diff", "", "```diff", diff.stdout.trimEnd(), "```");
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}

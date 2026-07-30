#!/usr/bin/env node
/**
 * Fail while any quality-gate waiver is still unacknowledged.
 *
 * Wire this into a repository pre-commit hook, and into CI. A plugin cannot
 * install a git hook, so this ships as a plain command instead.
 *
 *   node scripts/check-skips.mjs [repoRoot]
 *
 * Exit 0 when nothing is open. Exit 1 when a waiver needs a human.
 */

import { unacknowledged } from "./sentinel.mjs";

export function renderOpen(records) {
  const lines = [`quality-guard: ${records.length} unacknowledged waiver(s).`, ""];
  for (const record of records) {
    const kind = record.rebaseline ? "rebaseline" : "new-file ceiling";
    lines.push(`  ${record.file}  [${kind}]  ${record.at ?? "unknown time"}`);
  }
  lines.push("");
  lines.push('Review each one, then set "acknowledged": true in .github/quality/skip-log.json.');
  return lines.join("\n");
}

export function main(root) {
  const open = unacknowledged(root);
  if (open.length === 0) return 0;
  process.stderr.write(`${renderOpen(open)}\n`);
  return 1;
}

if (process.argv[1]?.endsWith("check-skips.mjs")) {
  process.exit(main(process.argv[2] ?? process.cwd()));
}

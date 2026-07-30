/**
 * Read side of the sentinel audit trail.
 *
 * The hook writes this log from `scripts/sentinel.mjs`, which cannot import
 * TypeScript. The path below is therefore stated twice, and `skips.test.ts`
 * asserts that the two copies agree. A drift there would silently hide
 * waivers from the server while the hook kept recording them.
 */

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export const SKIP_LOG = path.join(".github", "quality", "skip-log.json");

export interface SkipRecord {
  file: string;
  reasons?: string[];
  rebaseline?: boolean;
  at?: string;
  acknowledged?: boolean;
}

export function readSkipLog(root: string): SkipRecord[] {
  const target = path.join(root, SKIP_LOG);
  if (!existsSync(target)) return [];
  try {
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function formatSkips(records: SkipRecord[]): string {
  const open = records.filter((record) => record.acknowledged !== true);
  if (open.length === 0) return "No unacknowledged quality-gate waivers.";

  const lines = [`${open.length} unacknowledged waiver(s):`, ""];
  for (const record of open) {
    const kind = record.rebaseline ? "rebaseline" : "new-file ceiling";
    lines.push(`${record.file}  [${kind}]  ${record.at ?? "unknown time"}`);
    for (const reason of record.reasons ?? []) {
      for (const line of reason.split("\n")) lines.push(`    ${line}`);
    }
  }
  lines.push("", `Acknowledge by setting "acknowledged": true in ${SKIP_LOG}.`);
  return lines.join("\n");
}

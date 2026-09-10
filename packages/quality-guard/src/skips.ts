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

const SKIP_LOG = path.join(".github", "quality", "skip-log.json");

interface SkipRecord {
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

  return [
    `${open.length} unacknowledged waiver(s):`,
    "",
    ...open.flatMap(formatRecord),
    "",
    `Acknowledge by setting "acknowledged": true in ${SKIP_LOG}.`,
  ].join("\n");
}

function formatRecord(record: SkipRecord): string[] {
  return [
    `${record.file}  [${recordKind(record)}]  ${recordTime(record)}`,
    ...recordReasons(record),
  ];
}

function recordKind(record: SkipRecord): string {
  if (record.rebaseline) return "rebaseline";
  return "new-file ceiling";
}

function recordTime(record: SkipRecord): string {
  if (record.at) return record.at;
  return "unknown time";
}

function recordReasons(record: SkipRecord): string[] {
  if (!record.reasons) return [];
  return record.reasons.flatMap((reason) =>
    reason.split("\n").map((line) => `    ${line}`),
  );
}

/**
 * `.quality-skip` - a one-shot escape from the quality gate.
 *
 * An empty file waives the new-file ceiling for the next blocked write.
 * `{"rebaseline": true}` also raises the bar for a tracked file, which is the
 * deliberate-refactor case where a count really does have to go up.
 *
 * Every consumption is recorded and the sentinel is deleted, so the escape
 * cannot be left switched on. The record starts unacknowledged, and the
 * pre-commit hook refuses a commit while any unacknowledged record remains.
 * That is the point: this bypass is easy, but it is never silent.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SENTINEL_NAME = ".quality-skip";
export const SKIP_LOG = join(".github", "quality", "skip-log.json");

/**
 * The sentinel's intent, or null when no sentinel is present.
 * An unparseable or empty file means the plain waiver.
 */
export function readSentinel(repoRoot) {
  const path = join(repoRoot, SENTINEL_NAME);
  if (!existsSync(path)) return null;
  let parsed = {};
  try {
    const text = readFileSync(path, "utf8").trim();
    if (text) parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return { rebaseline: parsed?.rebaseline === true };
}

export function deleteSentinel(repoRoot) {
  try {
    rmSync(join(repoRoot, SENTINEL_NAME), { force: true });
  } catch {
    // A read-only tree must not break the write that already happened.
  }
}

export function readSkipLog(repoRoot) {
  const path = join(repoRoot, SKIP_LOG);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Append one consumption record. Returns the record that was written. */
export function recordConsumption(repoRoot, entry) {
  const path = join(repoRoot, SKIP_LOG);
  const record = { ...entry, at: new Date().toISOString(), acknowledged: false };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify([...readSkipLog(repoRoot), record], null, 2)}\n`);
  } catch {
    // Losing the log must not silently lose the block, so the caller still
    // reports. A tree that cannot be written cannot be committed either.
  }
  return record;
}

export function unacknowledged(repoRoot) {
  return readSkipLog(repoRoot).filter((record) => record.acknowledged !== true);
}

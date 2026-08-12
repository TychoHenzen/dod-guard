#!/usr/bin/env node
// check-trace - run the OpenSpec closure check over every active change.
//
// `dod-guard trace` asks two questions of one change. Does every DoD leaf
// trace back to a scenario, and does every scenario reach a leaf? The first
// blocks, because a proof nobody asked for means the DoD drifted from the
// spec. The second only reports, because a spec may legitimately be ahead of
// the last converter run.
//
// A change with no dod.md is skipped, not failed. A change still in planning
// has no proofs yet, and blocking on that would stop every proposal before it
// reaches the dod artifact.
//
// This runs against the bundle built from this checkout, never a globally
// installed dod-guard. CI has no ~/.claude/dod-store, so trace reads the
// committed dod.md instead - see loadTraceTree in src/openspec/trace.ts.
//
// Usage: node scripts/ci/check-trace.mjs
//
// Exit codes:
//   0  every traced change closed, or no change had a DoD to check
//   1  at least one change has a DoD leaf that traces to no scenario
//   3  the bundle is missing, so nothing could be checked

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHANGES = join(ROOT, "openspec", "changes");
const BUNDLE = join(ROOT, "packages", "dod-guard", "dist", "bundle.js");

/** Active change directories that carry a generated DoD. `archive` holds
 * finished changes, which no longer gate anything. */
function changesWithDod() {
  if (!existsSync(CHANGES)) return [];
  return readdirSync(CHANGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive")
    .map((e) => e.name)
    .filter((name) => existsSync(join(CHANGES, name, "dod.md")));
}

function trace(changeId) {
  const run = spawnSync(process.execPath, [BUNDLE, "trace", changeId], { cwd: ROOT, encoding: "utf-8" });
  process.stdout.write(`\n=== ${changeId} ===\n${run.stdout ?? ""}${run.stderr ?? ""}`);
  return run.status ?? 1;
}

function main() {
  if (!existsSync(BUNDLE)) {
    process.stderr.write(`ERROR: ${BUNDLE} is missing. Run 'npm run bundle -w packages/dod-guard' first.\n`);
    return 3;
  }

  const ids = changesWithDod();
  if (ids.length === 0) {
    process.stdout.write("No active change has a dod.md yet. Nothing to trace.\n");
    return 0;
  }

  const failed = ids.filter((id) => trace(id) !== 0);
  if (failed.length > 0) {
    process.stderr.write(`\nUntraced DoD leaves in: ${failed.join(", ")}\n`);
    return 1;
  }
  process.stdout.write(`\nAll ${ids.length} change(s) closed: every DoD leaf traces to a scenario.\n`);
  return 0;
}

process.exit(main());

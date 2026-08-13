// The ledger is the loop's whole memory. Each invocation of the skill runs one
// target and exits, so nothing survives in context. What the loop already
// tried, what it accepted, and what resisted two cycles all live here.
//
// A reseed must not erase that history. Otherwise the loop re-picks a target it
// already failed twice, every time somebody refreshes the scores.

import { changeIdForFile, isChangeOpen } from "./change-id.mjs";

const LEDGER_VERSION = 1;
export const MAX_ATTEMPTS = 2;

const CARRIED = ["status", "attempts", "after", "commit", "reason"];

function newEntry(candidate) {
  return {
    file: candidate.file,
    score: candidate.score,
    rules: candidate.rules,
    churn: candidate.churn,
    hasOracle: candidate.hasOracle,
    status: "pending",
    attempts: 0,
    before: { score: candidate.score },
    after: null,
    commit: null,
    reason: null,
  };
}

export function buildLedger(ranked, meta = {}) {
  return {
    version: LEDGER_VERSION,
    ...meta,
    entries: ranked.map(newEntry),
  };
}

// Ranking is fresh, history is not. The new scan decides which files are in
// the ledger and what they score. The old ledger says what happened to them.
export function mergeLedger(ledger, ranked) {
  const known = new Map(ledger.entries.map((entry) => [entry.file, entry]));
  const entries = ranked.map((candidate) => {
    const entry = newEntry(candidate);
    const previous = known.get(candidate.file);
    if (!previous) {
      return entry;
    }
    for (const key of CARRIED) {
      entry[key] = previous[key];
    }
    entry.before = previous.before;
    return entry;
  });
  return { ...ledger, version: LEDGER_VERSION, entries };
}

// An accepted entry is a retry candidate for as long as its change stays
// unarchived; resistant is a permanent close, since nothing gets merged.
function isAvailable(entry, root) {
  if (entry.status === "pending") {
    return entry.attempts < MAX_ATTEMPTS;
  }
  if (entry.status === "accepted") {
    return isChangeOpen(root, changeIdForFile(entry.file));
  }
  return false;
}

export function nextTarget(ledger, root) {
  return ledger.entries.find((entry) => isAvailable(entry, root)) ?? null;
}

// Every cycle ends here, including the failed ones. An attempt that is not
// recorded is an attempt the loop repeats forever.
export function recordResult(ledger, file, result) {
  if (!ledger.entries.some((entry) => entry.file === file)) {
    throw new Error(`ledger holds no entry for ${file}`);
  }
  const entries = ledger.entries.map((entry) => {
    if (entry.file !== file) {
      return entry;
    }
    return { ...entry, ...result, attempts: entry.attempts + 1 };
  });
  return { ...ledger, entries };
}

export function summarize(ledger) {
  const counts = { pending: 0, accepted: 0, resistant: 0 };
  for (const entry of ledger.entries) {
    counts[entry.status] += 1;
  }
  return counts;
}

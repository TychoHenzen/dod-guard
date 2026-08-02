// Reading and writing the ledger file. Kept apart from ledger.mjs so the state
// transitions stay pure and every CLI reaches the file the same way.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_LEDGER = ".tighten/ledger.json";

function ledgerPath(args) {
  const root = resolve(args.root ?? ".");
  return resolve(root, args.ledger ?? DEFAULT_LEDGER);
}

// Every CLI needs the same two things and reports the same failure when the
// ledger is not there yet. A missing ledger comes back as a null document
// rather than an exception, because "seed it first" is advice, not a crash.
export function openLedger(args) {
  const path = ledgerPath(args);
  if (!existsSync(path)) {
    return { path, ledger: null };
  }
  return { path, ledger: JSON.parse(readFileSync(path, "utf8")) };
}

export function writeLedgerFile(path, ledger) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
}

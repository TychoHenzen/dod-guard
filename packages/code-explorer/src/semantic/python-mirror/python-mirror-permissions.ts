import { chmodSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

// chmod follows links, so a link entry is skipped instead of changing the
// file it points to. rmSync later unlinks the link itself.
export function makeTreeReadOnly(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      makeTreeReadOnly(target);
      continue;
    }
    chmodSync(target, 0o444);
  }
  chmodSync(directory, 0o555);
}

export function makeTreeWritable(directory: string): void {
  // lstat, so a root that is itself a link is never followed.
  if (!lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      makeTreeWritable(target);
      continue;
    }
    chmodSync(target, 0o644);
  }
  chmodSync(directory, 0o755);
}

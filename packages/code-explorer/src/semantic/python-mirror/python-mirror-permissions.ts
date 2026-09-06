import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function makeTreeReadOnly(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      makeTreeReadOnly(target);
      continue;
    }
    chmodSync(target, 0o444);
  }
  chmodSync(directory, 0o555);
}

export function makeTreeWritable(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      makeTreeWritable(target);
      continue;
    }
    chmodSync(target, 0o644);
  }
  chmodSync(directory, 0o755);
}

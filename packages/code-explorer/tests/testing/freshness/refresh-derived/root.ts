import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function root(): string {
  const directory = mkdtempSync(join(tmpdir(), "code-explorer-refresh-"));
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "src", "lib.rs"), "fn fixture() {}\n");
  return directory;
}

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function fixtureRoot(): string {
  const root = mkdtempSync(
    join(tmpdir(), "code-explorer-navigation-practice-"),
  );
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "navigation.rs"),
    "fn helper_target() { Destination; }\nstruct Destination;\n",
  );
  return root;
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as sensitive from "../../../discovery/sensitive-paths.js";
export function sensitiveFixtureCount() {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-sensitive-count-"));
  try {
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "keys"));
    writeFileSync(join(root, "src/main.ts"), "export const main = 1;");
    writeFileSync(join(root, ".env"), "fixture=value");
    writeFileSync(join(root, "keys/a.pem"), "fixture-key");
    return sensitive.countSensitivePathsUnderRoot(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

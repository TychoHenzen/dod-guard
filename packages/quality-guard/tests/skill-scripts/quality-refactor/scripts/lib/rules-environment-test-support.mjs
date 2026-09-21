import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function withProject(files, check) {
  const root = mkdtempSync(join(tmpdir(), "quality-environment-"));
  try {
    for (const [name, text] of Object.entries(files))
      writeFileSync(join(root, name), text);
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

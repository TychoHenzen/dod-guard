import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeEntry(root, name, text) {
  const path = join(root, name);
  if (text === null) {
    mkdirSync(path, { recursive: true });
    return;
  }
  writeFileSync(path, text);
}

export function withProject(files, check) {
  const root = mkdtempSync(join(tmpdir(), "quality-environment-"));
  try {
    for (const [name, text] of Object.entries(files))
      writeEntry(root, name, text);
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

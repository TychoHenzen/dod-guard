// A target is done when its OpenSpec change archives (SKILL.md Phase 12),
// not when the ledger says so. The id is computed from the file path rather
// than stored, so it can never drift from the file it names.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Deterministic so pick-target.mjs and `openspec propose` (SKILL.md Phase 1)
// land on the same id with nothing stored.
export function changeIdForFile(file) {
  const stripped = file.replace(/\.[^./\\]+$/, "");
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `tighten-${slug}`;
}

// Still on disk means open: never archived (a retry candidate) or freshly
// proposed. Matches how src/cover/enumerate.ts treats openspec/changes/<id>/.
export function isChangeOpen(root, changeId) {
  return existsSync(resolve(root, "openspec", "changes", changeId));
}

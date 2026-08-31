import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createFilteredWorkspace } from "./filtered-workspace.js";
import { createNativeProjectRoot } from "./project-root.js";

// covers: code-explorer/symbol-discovery :: Sensitive paths are never indexed or returned :: Project configuration tries to include a denied path
it("creates a native backend root before initialization without sensitive content", () => {
  const project = mkdtempSync(join(tmpdir(), "code-explorer-sensitive-native-"));
  try {
    mkdirSync(join(project, "src"));
    writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n");
    writeFileSync(join(project, ".env"), "SECRET=not-for-backends\n");
    writeFileSync(join(project, ".code-explorer.json"), JSON.stringify({ production: [".env"] }));
    const filtered = createFilteredWorkspace(createNativeProjectRoot(project));
    try {
      assert.equal(filtered.sensitive_paths_excluded, 1);
      assert.equal(existsSync(join(filtered.root.canonicalPath, ".env")), false);
      assert.equal(existsSync(join(filtered.root.canonicalPath, ".code-explorer.json")), false);
      assert.equal(readFileSync(join(filtered.root.canonicalPath, "src", "main.rs"), "utf8"), "fn main() {}\n");
      assert.equal(JSON.stringify(filtered).includes(".env"), false);
    } finally {
      filtered.dispose();
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

it("never copies a Windows case-insensitive classification configuration into a native backend tree", () => {
  const project = mkdtempSync(join(tmpdir(), "code-explorer-config-case-native-"));
  try {
    mkdirSync(join(project, "src"));
    writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n");
    writeFileSync(join(project, ".CODE-EXPLORER.JSON"), JSON.stringify({ production: [".env"] }));
    const filtered = createFilteredWorkspace(createNativeProjectRoot(project));
    try {
      assert.equal(existsSync(join(filtered.root.canonicalPath, ".CODE-EXPLORER.JSON")), false);
      assert.equal(readFileSync(join(filtered.root.canonicalPath, "src", "main.rs"), "utf8"), "fn main() {}\n");
    } finally {
      filtered.dispose();
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

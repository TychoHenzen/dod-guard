import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync as removeSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createNativeProjectRoot } from "../semantic/project-root/\
project-root.js";
import { createFilteredWorkspace } from "../semantic/workspace/\
filtered-workspace.js";

it("creates a native backend root without sensitive paths", () => {
  const project = mkdtempSync(
    join(tmpdir(), "code-explorer-sensitive-native-"),
  );
  try {
    mkdirSync(join(project, "src"));
    writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n");
    writeFileSync(join(project, ".env"), "SECRET=not-for-backends\n");
    writeFileSync(
      join(project, ".code-explorer.json"),
      JSON.stringify({ production: [".env"] }),
    );
    const filtered = createFilteredWorkspace(createNativeProjectRoot(project));
    try {
      assert.equal(filtered.sensitive_paths_excluded, 1);
      assert.equal(
        existsSync(join(filtered.root.canonicalPath, ".env")),
        false,
      );
      assert.equal(
        existsSync(join(filtered.root.canonicalPath, ".code-explorer.json")),
        false,
      );
      assert.equal(
        readFileSync(
          join(filtered.root.canonicalPath, "src", "main.rs"),
          "utf8",
        ),
        "fn main() {}\n",
      );
      assert.equal(JSON.stringify(filtered).includes(".env"), false);
    } finally {
      filtered.dispose();
    }
  } finally {
    removeSync(project, { recursive: true, force: true });
  }
});

it("never copies classification configuration into the workspace", () => {
  const project = mkdtempSync(
    join(tmpdir(), "code-explorer-config-case-native-"),
  );
  const configName =
    process.platform === "win32"
      ? ".CODE-EXPLORER.JSON"
      : ".code-explorer.json";
  try {
    mkdirSync(join(project, "src"));
    writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n");
    writeFileSync(
      join(project, configName),
      JSON.stringify({ production: [".env"] }),
    );
    const filtered = createFilteredWorkspace(createNativeProjectRoot(project));
    try {
      assert.equal(
        existsSync(join(filtered.root.canonicalPath, configName)),
        false,
      );
      assert.equal(
        readFileSync(
          join(filtered.root.canonicalPath, "src", "main.rs"),
          "utf8",
        ),
        "fn main() {}\n",
      );
    } finally {
      filtered.dispose();
    }
  } finally {
    removeSync(project, { recursive: true, force: true });
  }
});

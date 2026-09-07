import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import {
  classifyProjectPath,
  loadClassificationConfig,
} from "../../../discovery/classification.js";

it(
  "falls back to defaults and reports a malformed " +
    "classification configuration",
  () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-classification-"));
    try {
      writeFileSync(
        join(root, ".code-explorer.json"),
        JSON.stringify({ production: ["../escape.ts"], extra: [] }),
      );
      const loaded = loadClassificationConfig(root);
      assert.deepEqual(loaded.status, { classification_config_invalid: true });
      assert.deepEqual(classifyProjectPath("src/helper.ts", loaded.config), {
        content: "production",
        source: "production_marker",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
it("reads a Windows case-insensitive " + "configuration spelling", () => {
  const root = mkdtempSync(
    join(tmpdir(), "code-explorer-classification-case-"),
  );
  try {
    writeFileSync(
      join(root, ".CODE-EXPLORER.JSON"),
      JSON.stringify({ production: ["private/**"] }),
    );
    const loaded = loadClassificationConfig(root, "win32");
    assert.deepEqual(classifyProjectPath("private/helper.ts", loaded.config), {
      content: "production",
      source: "configuration",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

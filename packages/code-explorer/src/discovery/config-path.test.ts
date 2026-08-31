import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { classificationConfigPath, isClassificationConfigPath } from "./config-path.js";

it("accepts only the root classification filename using the configured platform case rules", () => {
  assert.equal(isClassificationConfigPath(".code-explorer.json", "linux"), true);
  assert.equal(isClassificationConfigPath(".CODE-EXPLORER.JSON", "win32"), true);
  assert.equal(isClassificationConfigPath("src/.code-explorer.json", "win32"), false);
});

it("returns the actual root directory spelling for a matching configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-config-path-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, ".CODE-EXPLORER.JSON"), "{}");
    assert.equal(classificationConfigPath(root, "win32"), join(root, ".CODE-EXPLORER.JSON"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

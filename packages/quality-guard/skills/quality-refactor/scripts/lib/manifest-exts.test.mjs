import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectManifests } from "./manifests.mjs";

// Which extensions count as usage evidence, and which must never count.

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "qr-manifest-exts-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a generic data file is not usage evidence", () => {
  withTempDir((dir) => {
    // .json, .yaml, .xml and friends are the shape build artifacts, caches and
    // audit reports take, and those are usually gitignored. Counting them made
    // the same commit pass locally and fail in CI. Only a file a human connects
    // on purpose belongs in MANIFEST_EXTS.
    for (const name of ["report.json", "config.yaml", "data.xml", "settings.toml", "notes.md"]) {
      writeFileSync(join(dir, name), "PlayerController\n");
    }
    assert.deepEqual(collectManifests(dir), []);
  });
});

test("a scene file is still usage evidence", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "Root.tscn"), '[ext_resource path=\"res://PlayerController.cs\"]\n');
    assert.deepEqual(
      collectManifests(dir).map((m) => m.rel),
      ["Root.tscn"],
    );
  });
});

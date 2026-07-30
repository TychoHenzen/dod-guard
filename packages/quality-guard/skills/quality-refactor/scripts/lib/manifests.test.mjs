// Characterization tests for manifests.mjs. Manifests are indirect-usage
// evidence files (scene, project, config, glue). They are never scanned for
// violations. These describe CURRENT behavior. They must not change it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectManifests } from "./manifests.mjs";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "quality-scan-manifests-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("collectManifests finds a sibling .tscn file and returns its text", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "RootScene.tscn"), '[node name="TerminalDisplay"]\n');
    const manifests = collectManifests(dir);
    assert.equal(manifests.length, 1);
    assert.equal(manifests[0].rel, "RootScene.tscn");
    assert.match(manifests[0].text, /TerminalDisplay/);
  });
});

test("collectManifests called with the actual repo root finds a manifest that sits ABOVE the scanned target directory", () => {
  withTempDir((dir) => {
    const targetDir = join(dir, "Scripts");
    mkdirSync(targetDir);
    writeFileSync(join(dir, "RootScene.tscn"), '[node name="TerminalDisplay"]\n');
    writeFileSync(join(targetDir, "TerminalDisplay.cs"), "public class TerminalDisplay {}\n");

    // Collecting from the real root finds the parent-level manifest...
    const fromRoot = collectManifests(dir);
    assert.equal(
      fromRoot.some((m) => m.rel === "RootScene.tscn"),
      true,
    );

    // ...but scoping the collector to the scanned target subdirectory (the
    // root-vs-target trap this step exists to fix) misses it entirely.
    const fromTargetOnly = collectManifests(targetDir);
    assert.equal(fromTargetOnly.length, 0);
  });
});

test("collectManifests excludes .md files", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "README.md"), "TerminalDisplay is documented here.\n");
    const manifests = collectManifests(dir);
    assert.equal(manifests.length, 0);
  });
});

test("collectManifests honors IGNORED_DIRS", () => {
  withTempDir((dir) => {
    const nodeModules = join(dir, "node_modules");
    mkdirSync(nodeModules);
    writeFileSync(join(nodeModules, "pkg.tscn"), "{}\n");
    const manifests = collectManifests(dir);
    assert.equal(manifests.length, 0);
  });
});

test("collectManifests honors an --exclude fragment", () => {
  withTempDir((dir) => {
    const excluded = join(dir, "vendored");
    mkdirSync(excluded);
    writeFileSync(join(excluded, "third_party.tscn"), "{}\n");
    writeFileSync(join(dir, "keep.tscn"), "{}\n");
    const manifests = collectManifests(dir, ["vendored"]);
    assert.deepEqual(
      manifests.map((m) => m.rel),
      ["keep.tscn"],
    );
  });
});

test("collectManifests skips a manifest-extension file that contains binary control bytes", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "weird.tscn"), Buffer.from([0x7b, 0x00, 0x7d]));
    const manifests = collectManifests(dir);
    assert.equal(manifests.length, 0);
  });
});

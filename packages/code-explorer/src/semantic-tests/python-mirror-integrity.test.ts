import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { createNativePythonMirror } from "../semantic/python-mirror/python-mirror-runtime.js";
import { disposeFixture, project } from "../testing/python-mirror-runtime-test-support.js";

it("rejects mapping after the original source changes", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    const uri = mirror.uriFor("src/a.py");
    writeFileSync(join(fixture.root, "src", "a.py"), "x = 2\n");
    assert.equal(mirror.pathForUri(uri), undefined);
  } finally {
    disposeFixture(fixture, mirror);
  }
});

it("rejects mapping after a mirror generation is modified", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    const uri = mirror.uriFor("src/a.py");
    const file = join(mirror.root, "src", "a.py");
    chmodSync(join(mirror.root, "src"), 0o755);
    chmodSync(file, 0o644);
    writeFileSync(file, "x = 2\n");
    assert.equal(mirror.pathForUri(uri), undefined);
  } finally {
    disposeFixture(fixture, mirror);
  }
});

it("denies or detects writes to nested immutable mirror paths", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    const uri = mirror.uriFor("src/a.py");
    let fileWriteRejected = false;
    try {
      writeFileSync(join(mirror.root, "src", "a.py"), "x = 2\n");
    } catch {
      fileWriteRejected = true;
    }
    let directoryWriteRejected = false;
    try {
      writeFileSync(join(mirror.root, "src", "new.py"), "x = 3\n");
    } catch {
      directoryWriteRejected = true;
    }
    assert.equal(fileWriteRejected || mirror.pathForUri(uri) === undefined, true);
    assert.equal(directoryWriteRejected || mirror.pathForUri(uri) === undefined, true);
  } finally {
    disposeFixture(fixture, mirror);
  }
});

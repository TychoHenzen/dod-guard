import assert from "node:assert/strict";
import { existsSync, lstatSync, statSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import {
  disposeFixture,
  project,
} from "../testing/python-mirror-runtime-test-support.js";
import { createNativePythonMirror } from "../semantic/python-mirror/python-mirror-runtime.js";

it("maps only unchanged protected source through an immutable genera", () => {
  const fixture = project({
    "src/a.py": "def target() -> str:\n    return 'safe'\n",
  });
  const mirror = createNativePythonMirror(fixture.project, 7);
  try {
    const uri = mirror.uriFor("src/a.py");
    assert.match(uri, /generation-7/);
    assert.equal(mirror.pathForUri(uri), "src/a.py");
    assert.equal(mirror.pathForUri(`${uri}/../escape.py`), undefined);
    assert.equal(mirror.uriFor("src/missing.py"), "");
    assert.equal(
      lstatSync(join(mirror.root, "src", "a.py")).isSymbolicLink(),
      false,
    );
    assert.ok(
      existsSync(join(mirror.root, "typeshed", "stdlib", "builtins.pyi")),
    );
    assert.equal(statSync(mirror.root).mode & 0o222, 0);
    assert.equal(statSync(join(mirror.root, "src")).mode & 0o222, 0);
    assert.equal(statSync(join(mirror.root, "src", "a.py")).mode & 0o222, 0);
  } finally {
    disposeFixture(fixture, mirror);
  }
});

it("omits denied credentials from the Python mirror before a backend", () => {
  const fixture = project({
    "src/a.py": "x = 1\n",
    ".env": "SECRET=not-for-pyright\n",
    "keys/nested.pem": "private",
  });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    assert.equal(existsSync(join(mirror.root, ".env")), false);
    assert.equal(existsSync(join(mirror.root, "keys", "nested.pem")), false);
    assert.equal(mirror.uriFor(".env"), "");
    assert.equal(JSON.stringify(mirror).includes(".env"), false);
  } finally {
    disposeFixture(fixture, mirror);
  }
});

it("omits a Windows case-insensitive classification file from the Py", () => {
  const fixture = project({
    "src/a.py": "x = 1\n",
    ".CoDe-ExPlOrEr.JsOn": JSON.stringify({
      production: [".env"],
      generated: ["private/**"],
    }),
  });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    assert.equal(existsSync(join(mirror.root, ".CoDe-ExPlOrEr.JsOn")), false);
    assert.equal(JSON.stringify(mirror).includes("CoDe-ExPlOrEr"), false);
  } finally {
    disposeFixture(fixture, mirror);
  }
});

it("rejects a URI from another mirror generation", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const first = createNativePythonMirror(fixture.project, 1);
  const second = createNativePythonMirror(fixture.project, 2);
  try {
    assert.equal(first.pathForUri(second.uriFor("src/a.py")), undefined);
  } finally {
    first.dispose();
    disposeFixture(fixture, second);
  }
});

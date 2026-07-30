// Characterization tests for walk.mjs. Covers loadFiles' isTest
// classification, including declared test-support fragments threaded in
// from the CLI. These describe CURRENT behavior. They must not change it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFiles } from "./walk.mjs";

function fakeFile(path, rel, lang = "cs") {
  return { path, rel, lang };
}

test("loadFiles marks a file under a declared test-path fragment as test code", () => {
  const files = [fakeFile(import.meta.filename, "Scenario/Runner.cs")];
  const [loaded] = loadFiles(files, ["Scenario/"]);
  assert.equal(loaded.isTest, true);
});

test("loadFiles leaves an ordinary production path alone when a declared fragment does not match it", () => {
  const files = [fakeFile(import.meta.filename, "Scripts/PlayerController.cs")];
  const [loaded] = loadFiles(files, ["Scenario/"]);
  assert.equal(loaded.isTest, false);
});

test("loadFiles called with no declared fragments behaves exactly as before", () => {
  const files = [
    fakeFile(import.meta.filename, "src/foo.test.mjs", "ts"),
    fakeFile(import.meta.filename, "src/foo.mjs", "ts"),
  ];
  const [testFile, prodFile] = loadFiles(files);
  assert.equal(testFile.isTest, true);
  assert.equal(prodFile.isTest, false);
});

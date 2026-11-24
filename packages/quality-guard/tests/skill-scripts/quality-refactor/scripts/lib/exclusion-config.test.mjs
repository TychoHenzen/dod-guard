import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CONFIG_FILE,
  ExclusionConfigError,
  loadRepoConfig,
} from "../../../../../skills/quality-refactor/scripts/lib/exclusion-config.mjs";

// One temp directory per case; `text` is written as the config file when given.
function rootWith(t, text) {
  const root = mkdtempSync(join(tmpdir(), "exclusion-config-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (text !== undefined) writeFileSync(join(root, CONFIG_FILE), text);
  return root;
}

const isConfigError = (error) =>
  error instanceof ExclusionConfigError &&
  /\.quality-guard\.json/.test(error.message);

test("a missing file adds no exclusion and no attribute", (t) => {
  assert.deepEqual(loadRepoConfig(rootWith(t)), {
    excludePaths: [],
    registeredAttributes: [],
  });
});

test("excludePaths is returned with forward slashes", (t) => {
  const text = JSON.stringify({ excludePaths: ["/vendor/", "\\gen\\"] });
  assert.deepEqual(loadRepoConfig(rootWith(t, text)).excludePaths, [
    "/vendor/",
    "/gen/",
  ]);
});

test("registeredAttributes is returned as written", (t) => {
  const text = JSON.stringify({
    registeredAttributes: ["Service", "AutoloadAttribute"],
  });
  assert.deepEqual(loadRepoConfig(rootWith(t, text)).registeredAttributes, [
    "Service",
    "AutoloadAttribute",
  ]);
});

test("a file without the keys adds none", (t) => {
  const text = JSON.stringify({ pathGroups: {} });
  assert.deepEqual(loadRepoConfig(rootWith(t, text)), {
    excludePaths: [],
    registeredAttributes: [],
  });
});

test("invalid JSON is an error naming the file", (t) => {
  assert.throws(() => loadRepoConfig(rootWith(t, "{")), isConfigError);
});

test("a non-array or non-string exclude entry is an error", (t) => {
  for (const excludePaths of ["x", [1], [""]]) {
    const text = JSON.stringify({ excludePaths });
    assert.throws(
      () => loadRepoConfig(rootWith(t, text)),
      ExclusionConfigError,
      JSON.stringify(excludePaths),
    );
  }
});

test("an attribute entry that is not a plain name is an error", (t) => {
  for (const registeredAttributes of [
    "Service",
    [1],
    [""],
    ["Godot.Service"],
    ["[Service]"],
    // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
    ["Service(typeof(X))"],
  ]) {
    const text = JSON.stringify({ registeredAttributes });
    assert.throws(
      () => loadRepoConfig(rootWith(t, text)),
      isConfigError,
      JSON.stringify(registeredAttributes),
    );
  }
});

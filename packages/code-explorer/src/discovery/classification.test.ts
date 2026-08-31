import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { classifyProjectPath, loadClassificationConfig, matchesDiscoveryFilters } from "./classification.js";

// covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Client filters by symbol kind and path
it("applies path, language, kind, content, and generated filters before ranking", () => {
  const production = classifyProjectPath("src/helper.ts");
  assert.equal(
    matchesDiscoveryFilters(
      "src/helper.ts",
      production,
      { path_globs: ["src/**"], languages: ["typescript"], kinds: ["function"] },
      { language: "typescript", kind: "function" },
    ),
    true,
  );
  assert.equal(matchesDiscoveryFilters("src/helper.ts", production, { kinds: ["class"] }, { kind: "function" }), false);
  assert.equal(matchesDiscoveryFilters("target/helper.ts", classifyProjectPath("target/helper.ts"), {}, {}), false);
});

// covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Client requests production content
// covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: File classification is unknown
it("keeps unknown only in the default search and excludes it from test and production-only filters", () => {
  const unknown = classifyProjectPath("tools/helper.ts");
  assert.deepEqual(unknown, { content: "unknown", source: "unknown" });
  assert.equal(matchesDiscoveryFilters("tools/helper.ts", unknown, {}, {}), true);
  assert.equal(matchesDiscoveryFilters("tools/helper.ts", unknown, { content: "production" }, {}), false);
  assert.equal(matchesDiscoveryFilters("tools/helper.ts", unknown, { content: "tests" }, {}), false);
});

// covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Classification rules conflict
// covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Client includes generated content
it("lets the last matching explicit configuration rule override generated markers", () => {
  const config = { generated: ["generated/**"], test: [], production: ["generated/**"], overrides: [] };
  assert.deepEqual(classifyProjectPath("generated/helper.ts", config), {
    content: "production",
    source: "configuration",
  });
  const generated = classifyProjectPath("target/helper.ts", config);
  assert.equal(matchesDiscoveryFilters("target/helper.ts", generated, { include_generated: true }, {}), true);
});

// covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Classification configuration is malformed
it("falls back to defaults and reports a malformed classification configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-classification-"));
  try {
    writeFileSync(join(root, ".code-explorer.json"), JSON.stringify({ production: ["../escape.ts"], extra: [] }));
    const loaded = loadClassificationConfig(root);
    assert.deepEqual(loaded.status, { classification_config_invalid: true });
    assert.deepEqual(classifyProjectPath("src/helper.ts", loaded.config), {
      content: "production",
      source: "production_marker",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("reads a Windows case-insensitive configuration spelling", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-classification-case-"));
  try {
    writeFileSync(join(root, ".CODE-EXPLORER.JSON"), JSON.stringify({ production: ["private/**"] }));
    const loaded = loadClassificationConfig(root, "win32");
    assert.deepEqual(classifyProjectPath("private/helper.ts", loaded.config), {
      content: "production",
      source: "configuration",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("recognizes standard language test names before ranking", () => {
  assert.deepEqual(classifyProjectPath("src/FooTests.cs"), { content: "test", source: "test_marker" });
  assert.deepEqual(classifyProjectPath("pkg/test_helper.py"), { content: "test", source: "test_marker" });
  assert.deepEqual(classifyProjectPath("crate/helper_test.rs"), { content: "test", source: "test_marker" });
});

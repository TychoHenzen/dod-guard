// .editorconfig max_line_length lookup: section matching, nearest-file and
// root = true climbing, and the rule that Biome keeps precedence for JS.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createEditorconfigResolver } from "../../../../../skills/quality-refactor/scripts/lib/editorconfig-width.mjs";
import { at, resolveIn, tempTree } from "./formatter-width-test-support.mjs";

const found = (width, source = ".editorconfig") => ({ width, source });

test("[*.cs] with 120 gives width 120 and source .editorconfig", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, { ".editorconfig": "[*.cs]\nmax_line_length = 120\n" }),
  );
  assert.deepEqual(resolve("src/a.cs"), found(120));
});

test("a path matching no section gives null", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, { ".editorconfig": "[*.cs]\nmax_line_length = 120\n" }),
  );
  assert.equal(resolve("src/a.ts"), null);
});

test("a nested .editorconfig beats the parent", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, {
      ".editorconfig": "[*]\nmax_line_length = 120\n",
      "pkg/.editorconfig": "[*.cs]\nmax_line_length = 100\n",
    }),
  );
  assert.deepEqual(resolve("pkg/a.cs"), found(100, "pkg/.editorconfig"));
});

test("root = true stops the upward search", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, {
      ".editorconfig": "[*.cs]\nmax_line_length = 120\n",
      "pkg/.editorconfig": "root = true\n[*.ts]\nmax_line_length = 100\n",
    }),
  );
  assert.equal(resolve("pkg/a.cs"), null);
  assert.deepEqual(resolve("pkg/a.ts"), found(100, "pkg/.editorconfig"));
});

test("a later matching section overrides an earlier one", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, {
      ".editorconfig":
        "[*]\nmax_line_length = 100\n[*.cs]\nmax_line_length = 140\n",
    }),
  );
  assert.deepEqual(resolve("src/a.cs"), found(140));
});

test("max_line_length = off gives null", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, { ".editorconfig": "[*.cs]\nmax_line_length = off\n" }),
  );
  assert.equal(resolve("src/a.cs"), null);
});

test("a non-integer value gives null", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, { ".editorconfig": "[*.cs]\nmax_line_length = 120.5\n" }),
  );
  assert.equal(resolve("src/a.cs"), null);
});

test("a malformed file never throws and gives null", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, {
      ".editorconfig": "[*.cs\nmax_line_length = 120\n= = [\n\u0000garbage",
    }),
  );
  assert.equal(resolve("src/a.cs"), null);
});

test("{cs,ts} braces and ** match", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, {
      ".editorconfig":
        "[{*.cs,*.ts}]\nmax_line_length = 110\n[lib/**.cs]\nmax_line_length = 130\n",
    }),
  );
  assert.deepEqual(resolve("src/a.ts"), found(110));
  assert.deepEqual(resolve("src/a.cs"), found(110));
  assert.deepEqual(resolve("lib/x/y/a.cs"), found(130));
  assert.equal(resolve("src/a.js"), null);
});

test("a pattern with a slash anchors to the config directory", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, { ".editorconfig": "[src/*.cs]\nmax_line_length = 130\n" }),
  );
  assert.deepEqual(resolve("src/a.cs"), found(130));
  assert.equal(resolve("other/src/a.cs"), null);
  assert.equal(resolve("src/deep/a.cs"), null);
});

test("a pattern without a slash matches at any depth", (t) => {
  const resolve = createEditorconfigResolver(
    tempTree(t, { ".editorconfig": "[*.cs]\nmax_line_length = 120\n" }),
  );
  assert.deepEqual(resolve("deep/er/x.cs"), found(120));
});

test("Biome wins for a JS file it formats", (t) => {
  const widths = resolveIn(
    t,
    {
      "biome.json": { formatter: { lineWidth: 100 } },
      ".editorconfig": "[*]\nmax_line_length = 120\n",
    },
    ["src/a.ts"],
  );
  assert.deepEqual(widths, [at(100, "biome.json")]);
});

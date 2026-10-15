// Which Biome config governs a file (#871 C2): nearest config up to the scan
// root, never above it, and the `extends` forms the resolver accepts.

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createWidthResolver } from "../../../../../skills/quality-refactor/scripts/lib/formatter-width.mjs";
import {
  at,
  FALLBACK,
  resolveIn,
  tempTree,
} from "./formatter-width-test-support.mjs";

const ROOT_100 = { "biome.json": { formatter: { lineWidth: 100 } } };

test("the nearest config decides, searching up to the root", (t) => {
  const files = {
    ...ROOT_100,
    "sub/biome.json": { extends: "//", formatter: { lineWidth: 90 } },
  };
  assert.deepEqual(resolveIn(t, files, ["a.ts", "sub/deep/b.ts"]), [
    at(100),
    at(90, "sub/biome.json"),
  ]);
});

test("an absolute path resolves like a root-relative one", (t) => {
  const dir = tempTree(t, ROOT_100);
  const widthFor = createWidthResolver(dir);
  assert.deepEqual(widthFor(join(dir, "src", "a.ts")), at(100));
  assert.deepEqual(widthFor(join(dir, "..", "outside.ts")), FALLBACK);
});

test("a config above the scan root is never read", (t) => {
  const widthFor = createWidthResolver(join(tempTree(t, ROOT_100), "inner"));
  assert.deepEqual(widthFor("a.ts"), FALLBACK);
});

test("a second root config below another one falls back", (t) => {
  const files = {
    ...ROOT_100,
    "plain/biome.json": { formatter: { lineWidth: 90 } },
    "own/biome.json": { root: false, formatter: { lineWidth: 110 } },
  };
  assert.deepEqual(resolveIn(t, files, ["plain/a.ts", "own/a.ts"]), [
    FALLBACK,
    at(110, "own/biome.json"),
  ]);
});

test('extends "//" layers the nested config over its ancestor', (t) => {
  const files = {
    ...ROOT_100,
    "inherits/biome.json": { extends: "//" },
    "narrows/biome.json": { extends: "//", formatter: { lineWidth: 90 } },
  };
  const paths = ["inherits/a.ts", "narrows/a.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [
    at(100),
    at(90, "narrows/biome.json"),
  ]);
});

test('extends "//" with no ancestor at or below the root falls back', (t) => {
  const nested = { extends: "//", formatter: { lineWidth: 90 } };
  const files = { ...ROOT_100, "pkg/biome.json": nested };
  const widthFor = createWidthResolver(join(tempTree(t, files), "pkg"));
  assert.deepEqual(widthFor("a.ts"), FALLBACK);
  assert.deepEqual(resolveIn(t, { "biome.json": nested }, ["a.ts"]), [
    FALLBACK,
  ]);
});

test("any extends form other than the string // falls back", (t) => {
  const files = {
    ...ROOT_100,
    "path/biome.json": { extends: "../base.json" },
    "list/biome.json": { extends: ["//"] },
  };
  const paths = ["path/a.ts", "list/a.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [FALLBACK, FALLBACK]);
});

test("an unreadable config falls back instead of deferring upward", (t) => {
  const dir = tempTree(t, ROOT_100);
  mkdirSync(join(dir, "pkg", "biome.json"), { recursive: true });
  const widthFor = createWidthResolver(dir);
  assert.deepEqual(widthFor("pkg/a.ts"), FALLBACK);
  assert.deepEqual(widthFor("a.ts"), at(100));
});

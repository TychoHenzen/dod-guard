// Which files a Biome config formats (#871 C2): include lists, ordered
// negation, directory patterns, glob support and file types.

import assert from "node:assert/strict";
import { test } from "node:test";
import { at, FALLBACK, resolveIn } from "./formatter-width-test-support.mjs";

const width = { lineWidth: 100 };

test("files.includes: ordered patterns, the last match decides", (t) => {
  const includes = ["**", "!gen", "gen/keep.ts", "!!vendor"];
  const files = { "biome.json": { files: { includes }, formatter: width } };
  const paths = ["a.ts", "gen/x.ts", "gen/keep.ts", "vendor/x.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [
    at(100),
    FALLBACK,
    at(100),
    FALLBACK,
  ]);
});

test("formatter.includes filters the same way and must also match", (t) => {
  const formatter = { ...width, includes: ["src/**/*.ts", "!src/legacy"] };
  const skip = { includes: ["**", "!src/skip.ts"] };
  const files = { "biome.json": { files: skip, formatter } };
  const paths = ["src/a/b.ts", "src/legacy/x.ts", "lib/a.ts", "src/skip.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [
    at(100),
    FALLBACK,
    FALLBACK,
    FALLBACK,
  ]);
});

test("a pattern naming a directory covers the files beneath it", (t) => {
  const includes = ["lib", "pkg", "!**/dist"];
  const files = { "biome.json": { files: { includes }, formatter: width } };
  const paths = ["lib/deep/x.ts", "pkg/dist/x.js", "other/x.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [at(100), FALLBACK, FALLBACK]);
});

test("only JS and TS family files are resolved", (t) => {
  const files = { "biome.json": { formatter: width } };
  const js = ["a.ts", "a.tsx", "a.mts", "a.cts", "a.js", "a.jsx", "a.mjs"];
  const other = ["a.py", "a.json", "a.rs", "a.cs"];
  assert.deepEqual(resolveIn(t, files, [...js, "a.cjs", ...other]), [
    ...Array(8).fill(at(100)),
    ...Array(4).fill(FALLBACK),
  ]);
});

test("a glob beyond *, ** and literal segments falls back", (t) => {
  const nested = (settings) => ({ root: false, formatter: width, ...settings });
  const files = {
    "brace/biome.json": nested({ files: { includes: ["**/*.{ts,js}"] } }),
    "query/biome.json": nested({ formatter: { ...width, includes: ["a?"] } }),
    "class/biome.json": nested({
      overrides: [{ includes: ["[ab].ts"], formatter: { lineWidth: 90 } }],
    }),
    "mixed/biome.json": nested({
      formatter: { ...width, includes: ["src**/x.ts"] },
    }),
  };
  const paths = ["brace/a.ts", "query/a.ts", "class/z.ts", "mixed/a.ts"];
  assert.deepEqual(resolveIn(t, files, paths), Array(4).fill(FALLBACK));
});

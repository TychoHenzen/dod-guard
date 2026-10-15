// How layered Biome settings decide one width (#871 C2). Where this differs
// from the C2 text it pins what Biome 2.5.3 did in temp-dir probes.

import assert from "node:assert/strict";
import { test } from "node:test";
import { at, FALLBACK, resolveIn } from "./formatter-width-test-support.mjs";

const ts = ["**/*.ts"];
const override = (includes, lineWidth) => ({
  includes,
  formatter: { lineWidth },
});

test("matching overrides apply in order and the later one wins", (t) => {
  const overrides = [
    override(["src/**"], 90),
    override(["src/a/**"], 110),
    override(["test/**"], 70),
  ];
  const files = { "biome.json": { formatter: { lineWidth: 100 }, overrides } };
  const paths = ["src/a/x.ts", "src/b/x.ts", "lib/x.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [at(110), at(90), at(100)]);
});

test("an ancestor's overrides apply after the nested base config", (t) => {
  const files = {
    "biome.json": { overrides: [override(ts, 140)] },
    "sub/biome.json": { extends: "//", formatter: { lineWidth: 100 } },
    "both/biome.json": { extends: "//", overrides: [override(ts, 110)] },
  };
  assert.deepEqual(resolveIn(t, files, ["sub/x.ts", "both/x.ts"]), [
    at(140),
    at(110, "both/biome.json"),
  ]);
});

test("an ancestor's globs are read from the nested config's directory", (t) => {
  const files = {
    "biome.json": {
      formatter: { lineWidth: 140 },
      overrides: [override(["x.ts"], 100)],
    },
    "sub/biome.json": { extends: "//" },
  };
  const narrowed = {
    "biome.json": { formatter: { lineWidth: 140, includes: ["sub/**"] } },
    "sub/biome.json": { extends: "//" },
  };
  const paths = ["sub/x.ts", "sub/y.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [at(100), at(140)]);
  assert.deepEqual(resolveIn(t, narrowed, ["sub/x.ts"]), [FALLBACK]);
});

test("an ancestor's files.includes also gates from its own directory", (t) => {
  const files = {
    "biome.json": {
      files: { includes: ["**", "!sub"] },
      formatter: { lineWidth: 140 },
    },
    "sub/biome.json": { extends: "//" },
  };
  assert.deepEqual(resolveIn(t, files, ["sub/x.ts"]), [FALLBACK]);
});

test("javascript.formatter.lineWidth beats formatter.lineWidth", (t) => {
  const js = (lineWidth) => ({ formatter: { lineWidth } });
  const files = {
    "biome.json": {
      formatter: { lineWidth: 100 },
      javascript: js(110),
      overrides: [{ ...override(["o/**"], 90), javascript: js(95) }],
    },
  };
  assert.deepEqual(resolveIn(t, files, ["a.ts", "o/a.ts"]), [at(110), at(95)]);
});

test("a disabled formatter falls back", (t) => {
  const width = { lineWidth: 100 };
  const disabled = { enabled: false };
  const files = {
    "general/biome.json": { formatter: { ...width, ...disabled } },
    "js/biome.json": { formatter: width, javascript: { formatter: disabled } },
    "part/biome.json": {
      formatter: width,
      overrides: [{ includes: ["off"], formatter: disabled }],
    },
  };
  const paths = ["general/a.ts", "js/a.ts", "part/off/a.ts", "part/on/a.ts"];
  assert.deepEqual(resolveIn(t, files, paths), [
    FALLBACK,
    FALLBACK,
    FALLBACK,
    at(100, "part/biome.json"),
  ]);
});

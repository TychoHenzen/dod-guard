// Reading Biome config files (#871 C2, R3): file names, JSONC syntax, the
// default width, and configs that must fall back without throwing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { at, FALLBACK, resolveIn } from "./formatter-width-test-support.mjs";

test("biome.json wins over biome.jsonc in the same directory", (t) => {
  const files = {
    "biome.json": { formatter: { lineWidth: 100 } },
    "biome.jsonc": { formatter: { lineWidth: 90 } },
  };
  assert.deepEqual(resolveIn(t, files, ["a.ts"]), [at(100)]);
});

test("a config that applies but sets no width gives Biome's 80", (t) => {
  const files = { "biome.json": { formatter: { indentWidth: 2 } } };
  assert.deepEqual(resolveIn(t, files, ["a.ts"]), [at(80)]);
});

test("biome.jsonc and commented biome.json are read as JSONC", (t) => {
  const jsonc = [
    "{",
    '  "$schema": "https://biomejs.dev/schemas/2.5.3/schema.json", // url',
    '  /* block */ "formatter": { "lineWidth": 100, },',
    '  "overrides": [',
    '    { "includes": ["x/**",], "formatter": { "lineWidth": 90 } },',
    "  ],",
    "}",
  ].join("\n");
  const nested = '{ "extends": "//", // a comment after the string\n }';
  const files = { "biome.jsonc": jsonc, "sub/biome.json": nested };
  assert.deepEqual(resolveIn(t, files, ["a.ts", "x/a.ts", "sub/a.ts"]), [
    at(100, "biome.jsonc"),
    at(90, "biome.jsonc"),
    at(100, "biome.jsonc"),
  ]);
});

const lineWidth = (value) => ({ formatter: { lineWidth: value } });

const BROKEN = {
  parse: '{ "formatter": { "lineWidth": 100 ',
  comment: '{ /* never closed "formatter": {} }',
  array: "[]",
  zero: lineWidth(0),
  big: lineWidth(321),
  text: lineWidth("120"),
  fraction: lineWidth(99.5),
  unused: {
    ...lineWidth(100),
    overrides: [{ includes: ["none"], javascript: lineWidth(0) }],
  },
  "not-a-list": { files: { includes: "**" } },
};

test("a broken or invalid config falls back without throwing", (t) => {
  const names = Object.keys(BROKEN);
  const files = Object.fromEntries(
    names.map((name) => [`${name}/biome.json`, BROKEN[name]]),
  );
  const paths = names.map((name) => `${name}/a.ts`);
  const resolved = resolveIn(t, files, paths);
  assert.deepEqual(resolved, Array(paths.length).fill(FALLBACK));
});

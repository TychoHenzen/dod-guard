import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { suggestionFor } from "../../../../../skills/quality-refactor/scripts/lib/rule-suggestions.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";

test("real nested control flow still reports its nesting metric", () => {
  const opens = Array.from(
    { length: 6 },
    (_, index) => `${" ".repeat((index + 1) * 4)}if value {`,
  );
  const closes = Array.from(
    { length: 6 },
    (_, index) => `${" ".repeat((6 - index) * 4)}}`,
  );
  const source = [
    "fn deeply_nested(value: bool) -> bool {",
    ...opens,
    `${" ".repeat(28)}true`,
    ...closes,
    "    value",
    "}",
  ].join("\n");
  const violations = scanFile(
    {
      rel: "src/lib.rs",
      lang: "rs",
      isTest: false,
      source,
      lines: source.split("\n"),
    },
    buildConfig(),
  ).violations.filter((violation) => violation.rule === "nesting-depth");

  assert.deepEqual(violations, [
    {
      file: "src/lib.rs",
      line: 1,
      rule: "nesting-depth",
      severity: "high",
      message: "deeply_nested() nests 6 levels deep",
      metric: 6,
      suggestion: suggestionFor("nesting-depth"),
    },
  ]);
});

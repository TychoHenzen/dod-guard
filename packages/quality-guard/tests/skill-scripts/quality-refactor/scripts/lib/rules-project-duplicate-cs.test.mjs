import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { checkDuplication } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";

const usingBlock = [
  "using System;",
  "using System.Linq;",
  "using static System.Math;",
  "using A = Godot.Node;",
  "global using Godot;",
  "using Foo.Bar;",
];

const statementBlock = [
  "using var a = Open(1);",
  "using var b = Open(2);",
  "using var c = Open(3);",
  "using var d = Open(4);",
  "using var e = Open(5);",
  "using (var f = Open(6)) {",
];

test("a shared C# using-directive block is ignored", () => {
  const files = [
    {
      rel: "src/c.cs",
      lang: "cs",
      lines: [...usingBlock, "int one = 1;"],
    },
    {
      rel: "src/d.cs",
      lang: "cs",
      lines: [...usingBlock, "int two = 2;"],
    },
  ];
  assert.equal(checkDuplication(files, buildConfig()).length, 0);
});

test("shared C# using statements are still duplicate code", () => {
  const files = [
    { rel: "src/c.cs", lang: "cs", lines: [...statementBlock] },
    { rel: "src/d.cs", lang: "cs", lines: [...statementBlock] },
  ];
  assert.equal(checkDuplication(files, buildConfig()).length, 2);
});

test("the same lines in a TypeScript file are not ignored", () => {
  const files = [
    { rel: "src/c.ts", lang: "ts", lines: [...usingBlock] },
    { rel: "src/d.ts", lang: "ts", lines: [...usingBlock] },
  ];
  assert.equal(checkDuplication(files, buildConfig()).length, 2);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { checkDuplication } from "./rules-project.mjs";

const block = [
  "const a = 1;",
  "const b = 2;",
  "const c = 3;",
  "const d = 4;",
  "const e = 5;",
  "const f = 6;",
];

test("identical six-line blocks in two files are reported", () => {
  const files = [
    { rel: "src/c.ts", lines: [...block] },
    { rel: "src/d.ts", lines: [...block] },
  ];
  const found = checkDuplication(files, buildConfig("default"));
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((violation) => violation.file).sort(), [
    "src/c.ts",
    "src/d.ts",
  ]);
  for (const violation of found) {
    assert.equal(violation.rule, "duplicate-block");
    assert.equal(violation.severity, "warn");
    assert.equal(violation.metric, 2);
    assert.equal(violation.line, 1);
  }
});

test("files with no shared block are not reported", () => {
  const files = [
    { rel: "src/c.ts", lines: [...block] },
    {
      rel: "src/d.ts",
      lines: [
        "let p = 10;",
        "let q = 20;",
        "let r = 30;",
        "let s = 40;",
        "let t = 50;",
        "let u = 60;",
      ],
    },
  ];
  assert.equal(checkDuplication(files, buildConfig("default")).length, 0);
});

test("a shared import block is ignored", () => {
  const imports = [
    'import { a } from "./a.js";',
    'import { b } from "./b.js";',
    'import { c } from "./c.js";',
    'import { d } from "./d.js";',
    'export { e } from "./e.js";',
    'export { f } from "./f.js";',
  ];
  const files = [
    { rel: "src/c.ts", lines: [...imports, "const one = 1;"] },
    { rel: "src/d.ts", lines: [...imports, "const two = 2;"] },
  ];
  assert.equal(checkDuplication(files, buildConfig("default")).length, 0);
});

test("shared code under shared imports is still reported", () => {
  const shared = [
    'import { a } from "./a.js";',
    "const one = 1;",
    "const two = 2;",
    "const three = 3;",
    "const four = 4;",
    "const five = 5;",
    "const six = 6;",
  ];
  const files = [
    { rel: "src/c.ts", lines: [...shared] },
    { rel: "src/d.ts", lines: [...shared] },
  ];
  assert.equal(checkDuplication(files, buildConfig("default")).length, 2);
});

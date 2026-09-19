import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { checkWildcardImports } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import { fileWithCode, scansFor } from "./rules-project-fixtures.test.mjs";

test("reports only Python and Rust wildcard imports", () => {
  const files = [
    fileWithCode("src/wild.py", "from package import *\n", { lang: "py" }),
    fileWithCode("src/wild.rs", "use crate::items::*;\n", { lang: "rs" }),
    fileWithCode("src/ordinary.py", "from package import name\n", {
      lang: "py",
    }),
    fileWithCode("src/ordinary.rs", "use crate::items::Name;\n", {
      lang: "rs",
    }),
    fileWithCode("src/using.cs", "using System;\n", { lang: "cs" }),
    fileWithCode("src/export.ts", 'export * from "./module.js";\n'),
  ];
  const found = checkWildcardImports({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
  });
  assert.deepEqual(
    found.map(({ file, line, rule }) => ({ file, line, rule })),
    [
      { file: "src/wild.py", line: 1, rule: "wildcard-import" },
      { file: "src/wild.rs", line: 1, rule: "wildcard-import" },
    ],
  );
  assert.match(found[0].message, /import explicit names instead/);
});

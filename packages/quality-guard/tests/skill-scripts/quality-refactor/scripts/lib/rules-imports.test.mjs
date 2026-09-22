import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { checkWildcardImports } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import { fileWithCode, scansFor } from "./rules-project-fixtures.test.mjs";

const quietFiles = [
  fileWithCode("src/namespace.ts", 'import * as api from "./module.js";\n'),
  fileWithCode("src/ordinary.py", "from package import name\n", {
    lang: "py",
  }),
  fileWithCode("src/ordinary.rs", "use crate::items::Name;\n", {
    lang: "rs",
  }),
  fileWithCode("src/using.cs", "using System;\n", { lang: "cs" }),
  fileWithCode("src/export.ts", 'export * from "./module.js";\n'),
  fileWithCode(
    "src/inherited.cs",
    "class Base { public const int Limit = 1; }\nclass Child : Base { }\n",
    { lang: "cs" },
  ),
  fileWithCode(
    "src/class-attributes.py",
    "class Base:\n    limit = 1\nclass Child(Base):\n    pass\n",
    { lang: "py" },
  ),
  fileWithCode(
    "src/static.ts",
    "class Config { static readonly limit = 1; }\n",
  ),
  fileWithCode(
    "src/associated.rs",
    "struct Config;\nimpl Config { const LIMIT: u32 = 1; }\n",
    { lang: "rs" },
  ),
  fileWithCode("src/enum.cs", "enum State { Ready, Done }\n", { lang: "cs" }),
  fileWithCode(
    "src/enum.py",
    "from enum import Enum\nclass State(Enum):\n    Ready = 1\n    Done = 2\n",
    { lang: "py" },
  ),
  fileWithCode(
    "src/enum.ts",
    'enum State { Ready = "ready", Done = "done" }\ntype Choice = "ready" | "done";\nclass StateName {}\n',
  ),
  fileWithCode("src/enum.rs", "enum State { Ready, Done }\n", { lang: "rs" }),
  fileWithCode("src/constants.py", 'READY = "ready"\nDONE = "done"\n', {
    lang: "py",
  }),
];

test("reports only Python and Rust wildcard imports", () => {
  const files = [
    fileWithCode("src/wild.py", "from package import *\n", { lang: "py" }),
    fileWithCode("src/wild.rs", "use crate::items::*;\n", { lang: "rs" }),
    ...quietFiles,
  ];
  const found = checkWildcardImports({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
  });
  assert.deepEqual(found, [
    {
      file: "src/wild.py",
      line: 1,
      rule: "wildcard-import",
      severity: "warn",
      message:
        "package wildcard import obscures its imported API; import explicit names instead",
      suggestion: "Import explicit names from package.",
      metric: 1,
    },
    {
      file: "src/wild.rs",
      line: 1,
      rule: "wildcard-import",
      severity: "warn",
      message:
        "crate::items wildcard import obscures its imported API; import explicit names instead",
      suggestion: "Import explicit names from crate::items.",
      metric: 1,
    },
  ]);
});

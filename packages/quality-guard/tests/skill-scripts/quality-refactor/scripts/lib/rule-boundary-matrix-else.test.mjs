import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import {
  csFile,
  rustFile,
  scanViolations,
  tsFile,
} from "./rules-file-fixtures.test.mjs";
import { fileWithCode } from "./rules-project-fixtures.test.mjs";

// The fixtures modules have no Python, Go, Java, or C++ builder.
const fileOf = (lang) => (rel, code) => fileWithCode(rel, code, { lang });

// A quiet result counts only when the function was parsed.
const quietness = (file) => ({
  findings: scanViolations(file).filter((v) => v.rule === "else-branch"),
  parsed: scanFile(file, buildConfig()).functions.some(
    (fn) => fn.name === "pick",
  ),
});
const QUIET_OK = { findings: [], parsed: true };

// [file, builder, a genuine two-way if/else, the same function as a guard clause]
const CASES = [
  [
    "src/pick.ts",
    tsFile,
    "function pick(v: number): number {\n  if (v > 0) {\n    return 1;\n  } else {\n    return 2;\n  }\n}",
    "function pick(v: number): number {\n  if (v <= 0) {\n    return 2;\n  }\n  return 1;\n}",
  ],
  [
    "src/Pick.cs",
    csFile,
    "class Calc\n{\n    public int pick(int v)\n    {\n        if (v > 0)\n        {\n" +
      "            return 1;\n        }\n        else\n        {\n            return 2;\n" +
      "        }\n    }\n}",
    "class Calc\n{\n    public int pick(int v)\n    {\n        if (v <= 0)\n        {\n" +
      "            return 2;\n        }\n        return 1;\n    }\n}",
  ],
  [
    "src/pick.rs",
    rustFile,
    "fn pick(v: i32) -> i32 {\n    if v > 0 {\n        1\n    } else {\n        2\n    }\n}",
    "fn pick(v: i32) -> i32 {\n    if v <= 0 {\n        return 2;\n    }\n    1\n}",
  ],
  [
    "src/pick.py",
    fileOf("py"),
    "def pick(v):\n    if v > 0:\n        return 1\n    else:\n        return 2",
    "def pick(v):\n    if v <= 0:\n        return 2\n    return 1",
  ],
  [
    "src/pick.go",
    fileOf("go"),
    "func pick(v int) int {\n    if v > 0 {\n        return 1\n    } else {\n        return 2\n    }\n}",
    "func pick(v int) int {\n    if v <= 0 {\n        return 2\n    }\n    return 1\n}",
  ],
  [
    "src/Calc.java",
    fileOf("java"),
    "class Calc {\n    int pick(int v) {\n        if (v > 0) {\n            return 1;\n" +
      "        } else {\n            return 2;\n        }\n    }\n}",
    "class Calc {\n    int pick(int v) {\n        if (v <= 0) {\n            return 2;\n" +
      "        }\n        return 1;\n    }\n}",
  ],
  [
    "src/pick.cpp",
    fileOf("cpp"),
    "int pick(int v) {\n    if (v > 0) {\n        return 1;\n    } else {\n        return 2;\n    }\n}",
    "int pick(int v) {\n    if (v <= 0) {\n        return 2;\n    }\n    return 1;\n}",
  ],
];

for (const [rel, build, branch, guard] of CASES) {
  test(`${rel}: a genuine two-way if/else is one else-branch finding`, () => {
    const found = quietness(build(rel, branch)).findings;
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, "medium");
  });
  test(`${rel}: the same function as a guard clause is quiet`, () => {
    assert.deepEqual(quietness(build(rel, guard)), QUIET_OK);
  });
}

// Guard forms that are not if/else statements. Each must stay quiet.
const QUIET = [
  rustFile(
    "src/let.rs",
    "fn pick(o: Option<i32>) -> i32 {\n    let Some(v) = o else {\n        return 0;\n    };\n    v\n}",
  ),
  fileOf("py")(
    "src/for.py",
    "def pick(items):\n    for x in items:\n        return x\n    else:\n        return None",
  ),
];
test("a Rust let-else and a Python for/else are quiet", () => {
  for (const file of QUIET) {
    assert.deepEqual(quietness(file), QUIET_OK);
  }
});

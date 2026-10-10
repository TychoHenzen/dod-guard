import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { scanViolations } from "./rules-file-fixtures.test.mjs";
import { fileWithCode } from "./rules-project-fixtures.test.mjs";

// The generic path serves C, C++, C#, and Kotlin, which is scanned as "java".
const fileOf = (lang) => (rel, code) => fileWithCode(rel, code, { lang });
const elseFindings = (file) =>
  scanViolations(file).filter((v) => v.rule === "else-branch");

// A quiet result counts only when pick was parsed, so an empty list is not a miss.
function quietness(file) {
  return {
    findings: elseFindings(file),
    parsed: scanFile(file, buildConfig()).functions.some(
      (fn) => fn.name === "pick",
    ),
  };
}
const QUIET_OK = { findings: [], parsed: true };

test("a C++ #else, with or without a space after the hash, is not an if/else", () => {
  for (const directive of ["#else", "# else"]) {
    const code = [
      "int pick(int v) {",
      "#if FAST",
      "  return 1;",
      directive,
      "  return 2;",
      "#endif",
      "}",
    ].join("\n");
    assert.deepEqual(quietness(fileOf("cpp")("src/pick.cpp", code)), QUIET_OK);
  }
});

test("a C# #else preprocessor branch is not an if/else", () => {
  const code = [
    "class Pick",
    "{",
    "    public int pick(int v)",
    "    {",
    "#if FAST",
    "        return 1;",
    "#else",
    "        return 2;",
    "#endif",
    "    }",
    "}",
  ].join("\n");
  assert.deepEqual(quietness(fileOf("cs")("src/Pick.cs", code)), QUIET_OK);
});

test("a Kotlin when arm 'else -> value' is not an if/else", () => {
  const code =
    "fun pick(v: Int): Int {\nreturn when (v) {\n1 -> 10\nelse -> 20\n}\n}";
  assert.deepEqual(quietness(fileOf("java")("src/Pick.kt", code)), QUIET_OK);
});

test("a Kotlin block if/else in pick is still one finding", () => {
  const code =
    "fun pick(v: Int): Int {\nif (v > 0) {\nreturn 1\n} else {\nreturn 2\n}\n}";
  const found = elseFindings(fileOf("java")("src/Pick.kt", code));
  assert.equal(found.length, 1);
  assert.equal(found[0].metric, 1);
});

test("a C++ block if/else in pick is still one finding", () => {
  const code =
    "int pick(int v) {\n    if (v > 0) {\n        return 1;\n    } else {\n        return 2;\n    }\n}";
  const found = elseFindings(fileOf("cpp")("src/pick.cpp", code));
  assert.equal(found.length, 1);
  assert.equal(found[0].metric, 1);
});

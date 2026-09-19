import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./rules-comments-test-support.mjs";

test("reports only explicit output parameters", () => {
  const cases = [
    ["cs", "void Write(ref int value) { value = 1; }"],
    ["cs", "void Write(out int value) { value = 1; }"],
    ["rs", "fn write(value: &mut i32) { *value = 1; }"],
    ["rs", "fn write(value: & mut i32) { *value = 1; }"],
  ];
  for (const [language, code] of cases)
    assert.equal(scan(language, code, "output-parameter").length, 1, language);
  assert.deepEqual(
    scan("py", "def write(value):\n    value = 1\n", "output-parameter"),
    [],
  );
  assert.deepEqual(
    scan(
      "ts",
      "function write(value: Mutable) { return value; }",
      "output-parameter",
    ),
    [],
  );
  assert.deepEqual(
    scan("cs", "void Write(int @out) { }", "output-parameter"),
    [],
  );
  assert.deepEqual(
    scan("cs", "void Write(ref readonly int value) { }", "output-parameter"),
    [],
  );
  assert.deepEqual(
    scan("rs", "fn write(value: &i32) { }", "output-parameter"),
    [],
  );
  assert.deepEqual(
    scan(
      "rs",
      "impl Thing { fn write(self: &mut Self) { } }",
      "output-parameter",
    ),
    [],
  );
  assert.deepEqual(
    scan("rs", "fn write(value: Option<&mut i32>) { }", "output-parameter"),
    [],
  );
});

test("reports only explicit typed boolean flags", () => {
  const cases = [
    ["cs", "void Run(bool verbose) { }"],
    ["cs", "void Run(System.Boolean verbose) { }"],
    ["ts", "function run(verbose: boolean) { return verbose; }"],
    ["rs", "fn run(verbose: bool) { if verbose {} }"],
  ];
  for (const [language, code] of cases)
    assert.equal(scan(language, code, "flag-parameter").length, 1, language);
  for (const [language, code] of [
    ["py", "def run(verbose):\n    return verbose\n"],
    ["py", "def run(verbose=False):\n    return verbose\n"],
    ["cs", "void Run(bool? verbose) { }"],
    ["cs", "void Run(Nullable<bool> verbose) { }"],
    ["cs", "void Run(List<bool> verbose) { }"],
    ["cs", "void Run(bool verbose = false) { }"],
    ["ts", "function run(verbose: boolean | undefined) { return verbose; }"],
    ["ts", "function run(verbose: any) { return verbose; }"],
    ["ts", "function run(verbose: unknown) { return verbose; }"],
    ["ts", "function run(verbose: Array<boolean>) { return verbose; }"],
    ["ts", "function run(verbose?: boolean) { return verbose; }"],
    ["ts", "function run(verbose: boolean = false) { return verbose; }"],
    ["ts", "function run(verbose: boolean | null) { return verbose; }"],
    ["ts", "function run(this: boolean) { return this; }"],
    ["rs", "fn run(verbose: Option<bool>) { }"],
    ["rs", "fn run(verbose: &bool) { }"],
    ["rs", "fn run<T>(verbose: T) { }"],
  ]) {
    assert.deepEqual(scan(language, code, "flag-parameter"), [], language);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";

function scan(lang, rel, source) {
  return scanFile(
    { rel, lang, isTest: false, source, lines: source.split("\n") },
    buildConfig("default"),
  ).violations.filter((violation) => violation.rule === "naming-encoding");
}

test("reports encoded member prefixes across supported languages", () => {
  const cases = [
    ["cs", "class Ledger { private int m_total; }"],
    ["cs", "class Ledger { int m_total; }"],
    ["cs", "class Ledger { public int m_total { get; } }"],
    ["ts", "class Ledger { private m_total: number = 0; }"],
    ["ts", "class Ledger { m_total!: number; }"],
    ["rs", "struct Ledger {\n    m_total: i32,\n}"],
    ["py", "class Ledger:\n    def __init__(self):\n        self.m_total = 0"],
  ];
  for (const [lang, source] of cases) {
    const findings = scan(lang, `src/ledger.${lang}`, source);
    assert.equal(findings.length, 1, lang);
    assert.match(findings[0].message, /m_\/f_/);
    assert.equal(findings[0].severity, "warn");
  }
});

test("accepts ordinary names and keeps unrelated encoding-like uses quiet", () => {
  assert.deepEqual(
    scan("cs", "src/ledger.cs", "class Ledger { private int total; }"),
    [],
  );
  assert.deepEqual(
    scan("ts", "src/ledger.ts", "class Ledger { private total: number = 0; }"),
    [],
  );
  assert.deepEqual(
    scan("rs", "src/ledger.rs", "struct Ledger {\n    total: i32,\n}"),
    [],
  );
  assert.deepEqual(
    scan(
      "py",
      "src/ledger.py",
      "class Ledger:\n    def run(self, m_total):\n        return m_total",
    ),
    [],
  );
  assert.deepEqual(
    scan(
      "ts",
      "src/ledger.ts",
      "class Ledger {\n  run() {\n    let m_total = 0;\n    return { m_total: 0 };\n  }\n}",
    ),
    [],
  );
  assert.deepEqual(
    scan(
      "cs",
      "src/ledger.cs",
      "class Ledger {\n  void Run() {\n    const int m_total = 0;\n  }\n}",
    ),
    [],
  );
  assert.deepEqual(
    scan(
      "rs",
      "src/ledger.rs",
      "impl Ledger {\n  fn run(\n    m_total: i32,\n  ) {}\n}",
    ),
    [],
  );
});

test("does not report generated or interop paths", () => {
  assert.deepEqual(
    scan("cs", "generated/ledger.cs", "class Ledger { private int m_total; }"),
    [],
  );
  assert.deepEqual(
    scan(
      "ts",
      "interop/ledger.ts",
      "class Ledger { private f_total: number = 0; }",
    ),
    [],
  );
});

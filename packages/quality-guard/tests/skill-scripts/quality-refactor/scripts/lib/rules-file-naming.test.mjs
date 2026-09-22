import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { withProject } from "./rules-environment-test-support.mjs";

const qualityScan = fileURLToPath(
  import.meta.resolve(
    "../../../../../skills/quality-refactor/scripts/quality-scan.mjs",
  ),
);
const memberSources = {
  cs: (name) => `class Ledger { private int ${name}; }`,
  ts: (name) => `class Ledger { private ${name}: number = 0; }`,
  rs: (name) => `struct Ledger {\n    ${name}: i32,\n}`,
  py: (name) =>
    `class Ledger:\n    def __init__(self):\n        self.${name} = 0`,
};
const encodedMessage = (name) =>
  `${name} uses a type or scope encoding; rename it without the m_/f_ prefix`;

function scan(lang, rel, source) {
  return scanFile(
    { rel, lang, isTest: false, source, lines: source.split("\n") },
    buildConfig("default"),
  ).violations.filter((violation) => violation.rule === "naming-encoding");
}

function assertEncoded(lang, source, name) {
  const findings = scan(lang, `src/ledger.${lang}`, source);
  assert.equal(findings.length, 1, lang);
  assert.equal(findings[0].message, encodedMessage(name));
  assert.equal(findings[0].severity, "warn");
}

test("reports encoded member prefixes across supported languages", () => {
  for (const name of ["m_total", "f_total"]) {
    for (const [lang, sourceForName] of Object.entries(memberSources)) {
      assertEncoded(lang, sourceForName(name), name);
    }
  }
  const cases = [
    ["cs", "class Ledger { int m_total; }"],
    ["cs", "class Ledger { public int m_total { get; } }"],
    ["ts", "class Ledger { m_total!: number; }"],
  ];
  for (const [lang, source] of cases) assertEncoded(lang, source, "m_total");
});

test("accepts ordinary names and keeps unrelated encoding-like uses quiet", () => {
  const cases = JSON.parse(
    String.raw`[["cs","class Ledger { private int total; }"],["ts","class Ledger { private total: number = 0; }"],["rs","struct Ledger {\\n    total: i32,\\n}"],["py","class Ledger:\\n    def run(self, m_total):\\n        return m_total"],["ts","class Ledger {\\n  run() {\\n    let m_total = 0;\\n    return { m_total: 0 };\\n  }\\n}"],["cs","class Ledger {\\n  void Run() {\\n    const int m_total = 0;\\n  }\\n}"],["rs","impl Ledger {\\n  fn run(\\n    m_total: i32,\\n  ) {}\\n}"]]`,
  );
  for (const [lang, source] of cases)
    assert.deepEqual(scan(lang, `src/ledger.${lang}`, source), []);
});

test("suppresses both encoded prefixes in generated and interop paths", () => {
  for (const [lang, sourceForName] of Object.entries(memberSources)) {
    for (const prefix of ["m_", "f_"])
      for (const path of ["generated", "interop"]) {
        assert.deepEqual(
          scan(lang, `${path}/ledger.${lang}`, sourceForName(`${prefix}total`)),
          [],
          `${lang} ${prefix} ${path}`,
        );
      }
  }
});

test("prints actionable naming evidence in the quality-scan JSON report", () => {
  withProject(
    { src: null, "src/ledger.ts": memberSources.ts("f_total") },
    (root) => {
      const result = spawnSync(
        process.execPath,
        [
          qualityScan,
          `--root=${root}`,
          "--format=json",
          "--rules=naming-encoding",
          "--fail-on=any",
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(
        JSON.stringify(report.violations),
        '[{"file":"src/ledger.ts","line":1,"rule":"naming-encoding","severity":"warn","message":"f_total uses a type or scope encoding; rename it without the m_/f_ prefix","metric":1}]',
      );
    },
  );
});

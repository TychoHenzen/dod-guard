import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { withProject } from "./rules-environment-test-support.mjs";

const qualityScan = fileURLToPath(
  new URL(
    "../../../../../skills/quality-refactor/scripts/quality-scan.mjs",
    import.meta.url,
  ),
);
const memberSources = {
  cs: (name) => `class Ledger { private int ${name}; }`,
  ts: (name) => `class Ledger { private ${name}: number = 0; }`,
  rs: (name) => `struct Ledger {\n    ${name}: i32,\n}`,
  py: (name) =>
    `class Ledger:\n    def __init__(self):\n        self.${name} = 0`,
};

function scan(lang, rel, source) {
  return scanFile(
    { rel, lang, isTest: false, source, lines: source.split("\n") },
    buildConfig("default"),
  ).violations.filter((violation) => violation.rule === "naming-encoding");
}

test("reports f_ encoded members in all supported languages", () => {
  for (const [lang, sourceForName] of Object.entries(memberSources)) {
    const name = "f_total";
    const findings = scan(lang, `src/ledger.${lang}`, sourceForName(name));
    assert.equal(findings.length, 1, `${lang} ${name}`);
    assert.equal(
      findings[0].message,
      `${name} uses a type or scope encoding; rename it without the m_/f_ prefix`,
    );
    assert.equal(findings[0].severity, "warn");
  }
});

test("suppresses both encoded prefixes in generated and interop paths", () => {
  for (const [lang, sourceForName] of Object.entries(memberSources)) {
    for (const prefix of ["m_", "f_"]) {
      for (const path of ["generated", "interop"]) {
        assert.deepEqual(
          scan(lang, `${path}/ledger.${lang}`, sourceForName(`${prefix}total`)),
          [],
          `${lang} ${prefix} ${path}`,
        );
      }
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
      assert.deepEqual(report.violations, [
        {
          file: "src/ledger.ts",
          line: 1,
          rule: "naming-encoding",
          severity: "warn",
          message:
            "f_total uses a type or scope encoding; rename it without the m_/f_ prefix",
          metric: 1,
        },
      ]);
    },
  );
});

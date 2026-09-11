import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "dist", "bundle.js");

function runFixture(measures, text) {
  const root = mkdtempSync(resolve(tmpdir(), "quality-guard-textstat-"));
  const provider = resolve(root, "provider.mjs");
  writeFileSync(
    provider,
    `import { readFileSync } from "node:fs";\n` +
      "readFileSync(0, 'utf8');\n" +
      `process.stdout.write(${JSON.stringify(JSON.stringify({ measures }))});\n`,
  );
  try {
    return spawnSync(process.execPath, [cli, "readability", "--stdin"], {
      encoding: "utf8",
      input: text,
      env: {
        ...process.env,
        QUALITY_GUARD_TEXTSTAT_COMMAND: process.execPath,
        QUALITY_GUARD_TEXTSTAT_ARGS: JSON.stringify([provider]),
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const text =
  "This guide gives clear steps for a reader. Each sentence uses direct words " +
  "and keeps the next action easy to find. The explanation stays short and " +
  "shows why the change matters before it names the implementation detail.";

test("bundled readability command accepts a real plaintext stdin path", () => {
  const result = runFixture(
    { fleschReadingEase: 72, fleschKincaidGrade: 8 },
    text,
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "pass");
  assert.equal(report.score, 100);
});

test("bundled readability command reports a failing fixture", () => {
  const result = runFixture(
    { fleschReadingEase: 20, fleschKincaidGrade: 14 },
    text,
  );

  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "fail");
  assert.equal(report.threshold, 80);
  assert.match(report.message, /Context:/);
});

test("bundled readability command fails open when textstat is unavailable", () => {
  const result = spawnSync(process.execPath, [cli, "readability", "--stdin"], {
    encoding: "utf8",
    input: text,
    env: {
      ...process.env,
      QUALITY_GUARD_TEXTSTAT_COMMAND: "quality-guard-textstat-missing",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "unavailable");
  assert.match(report.message, /Readability check unavailable/);
});

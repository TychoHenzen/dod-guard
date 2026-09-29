import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillTestCommand = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).scripts[
  "test:dod-guard-skills"
];

function runFixture({ firstFails, secondFails }) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "dod-guard-skill-tests-"));
  try {
    const firstRoot = join(fixtureRoot, "first");
    const secondRoot = join(fixtureRoot, "second");
    mkdirSync(firstRoot);
    mkdirSync(secondRoot);
    writeFixtureTest(join(firstRoot, "first.test.mjs"), "first group", firstFails);
    writeFixtureTest(join(secondRoot, "second.test.mjs"), "second group", secondFails);

    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      ["--test", join(firstRoot, "*.test.mjs"), join(secondRoot, "*.test.mjs")],
      { encoding: "utf8", env: environment },
    );

    assert.equal(result.error, undefined);
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function writeFixtureTest(path, name, shouldFail) {
  const failure = shouldFail ? `throw new Error(${JSON.stringify(`${name} failed`)});` : "";
  writeFileSync(path, `import test from "node:test"; test(${JSON.stringify(name)}, () => { ${failure} });\n`);
}

test("runs both skill test globs in one Node test command", () => {
  assert.equal(
    skillTestCommand,
    'node --test "plugins/dod-guard/skills/*/scripts/*.test.mjs" "plugins/dod-guard/skills/*/scripts/lib/*.test.mjs"',
  );
  assert.doesNotMatch(skillTestCommand, /&&/);
});

test("reports the second group after the first group fails", () => {
  const result = runFixture({ firstFails: true, secondFails: false });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /first group/);
  assert.match(result.output, /second group/);
});

test("preserves a failing exit status when the second group fails", () => {
  const result = runFixture({ firstFails: false, secondFails: true });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /first group/);
  assert.match(result.output, /second group/);
});

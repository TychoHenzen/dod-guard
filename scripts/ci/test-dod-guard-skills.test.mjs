import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillRoot = join(repositoryRoot, "plugins", "dod-guard", "skills");

function runFixture({ firstFails, secondFails }) {
  const fixtureRoot = mkdtempSync(join(skillRoot, "test-fixture-"));
  try {
    const firstRoot = join(fixtureRoot, "scripts");
    const secondRoot = join(firstRoot, "lib");
    mkdirSync(secondRoot, { recursive: true });
    const firstName = "configured first skill group";
    const secondName = "configured second skill group";
    writeFixtureTest(join(firstRoot, "first.test.mjs"));
    writeFixtureTest(join(secondRoot, "second.test.mjs"));

    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    environment.DOD_GUARD_SKILL_FIXTURE_FAILURE = firstFails ? firstName : secondFails ? secondName : "";
    const npmArgs = ["run", "test:dod-guard-skills"];
    const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd", ...npmArgs] : npmArgs;
    const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", env: environment, shell: false });

    assert.equal(result.error, undefined);
    return { firstName, secondName, status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function writeFixtureTest(path) {
  writeFileSync(
    path,
    `import test from "node:test";

const group = import.meta.url.includes("/lib/") ? "configured second skill group" : "configured first skill group";

test(group, () => {
  if (process.env.DOD_GUARD_SKILL_FIXTURE_FAILURE === group) throw new Error(group + " failed");
});
`,
  );
}

test("runs both configured skill test globs through the npm script", () => {
  const result = runFixture({ firstFails: true, secondFails: false });

  assert.notEqual(result.status, 0);
  assert.match(result.output, new RegExp(result.firstName));
  assert.match(result.output, new RegExp(result.secondName));
});

test("preserves a failing exit status when the second group fails", () => {
  const result = runFixture({ firstFails: false, secondFails: true });

  assert.notEqual(result.status, 0);
  assert.match(result.output, new RegExp(result.firstName));
  assert.match(result.output, new RegExp(result.secondName));
});

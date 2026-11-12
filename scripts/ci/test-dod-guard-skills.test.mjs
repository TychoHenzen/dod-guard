import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillScript = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).scripts[
  "test:dod-guard-skills"
];

function runFixture({ firstFails, secondFails }) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "dod-guard-skills-"));
  try {
    const pluginRoot = join(fixtureRoot, "plugins", "dod-guard");
    const firstRoot = join(pluginRoot, "skills", "fixture", "scripts");
    const secondRoot = join(firstRoot, "lib");
    mkdirSync(secondRoot, { recursive: true });
    const firstName = "configured first skill group";
    const secondName = "configured second skill group";
    writeFileSync(
      join(fixtureRoot, "package.json"),
      JSON.stringify({ name: "skills-fixture", private: true, scripts: { "test:dod-guard-skills": skillScript } }),
    );
    writeFixtureTest(join(firstRoot, "first.test.mjs"), firstName);
    writeFixtureTest(join(secondRoot, "second.test.mjs"), secondName);
    writeFixtureTest(join(pluginRoot, "opencode-adapter.test.mjs"), "adapter stub group");

    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    environment.DOD_GUARD_SKILL_FIXTURE_FAILURE = firstFails ? firstName : secondFails ? secondName : "";
    const npmArgs = ["run", "test:dod-guard-skills"];
    const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd", ...npmArgs] : npmArgs;
    const result = spawnSync(command, args, { cwd: fixtureRoot, encoding: "utf8", env: environment, shell: false });

    assert.equal(result.error, undefined);
    return { fixtureRoot, firstName, secondName, status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function writeFixtureTest(path, group) {
  writeFileSync(
    path,
    `import test from "node:test";

const group = ${JSON.stringify(group)};

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

test("keeps its fixture outside the repository and removes it after the run", () => {
  const result = runFixture({ firstFails: true, secondFails: false });
  const fromRepository = relative(repositoryRoot, result.fixtureRoot);

  assert.ok(isAbsolute(fromRepository) || fromRepository.startsWith(".."), result.fixtureRoot);
  assert.equal(existsSync(result.fixtureRoot), false);
});

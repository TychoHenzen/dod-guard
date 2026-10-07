import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  OPENCODE,
  ROOT,
  assertNoDodGuardRegistration,
  assertSupportedOpenCode,
  createFixture,
  installLocalPackage,
  request,
  startServer,
  stop,
  waitFor,
} from "./opencode-fixture.mjs";

for (const [label, invalidConfig] of [
  ["missing", null],
  ["malformed", '{"$schema":"https://opencode.ai/config.json", "plugins": ['],
]) {
  test(`recovers from ${label} opencode.json through the bundled reload command`, async () => {
    assertSupportedOpenCode();
    const fixture = createFixture([], invalidConfig);
    let server;

    try {
      const connection = await startServer(fixture);
      ({ server } = connection);
      const { baseUrl, headers } = connection;

      await assertNoDodGuardRegistration(baseUrl, headers, label);
      writeFileSync(
        fixture.config,
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [ROOT] }, null, 2),
      );
      const reload = spawnSync(OPENCODE, ["reload", "--server", baseUrl], {
        cwd: fixture.project,
        env: fixture.environment,
        encoding: "utf8",
      });
      assert.equal(reload.status, 0, `${reload.stderr}\n${reload.stdout}`);

      const plugin = await waitFor("recovered dod-guard plugin", async () => {
        const result = await request(baseUrl, headers, "/api/plugin");
        const active = result.body.data?.find((entry) => entry.id === "dod-guard");
        return active?.state.status === "active" ? active : false;
      });
      assert.equal(plugin.source.type, "local", JSON.stringify(plugin));
    } finally {
      if (server) await stop(server);
      rmSync(fixture.fixture, { recursive: true, force: true });
      assert.equal(existsSync(fixture.fixture), false);
    }
  });
}

test("keeps an installed adapter idempotent across duplicate load, reload, and replacement", async () => {
  assertSupportedOpenCode();
  const fixture = createFixture([]);
  const installed = installLocalPackage(ROOT, join(fixture.fixture, "installed"), fixture.environment);
  const upgraded = installLocalPackage(ROOT, join(fixture.fixture, "upgrade"), fixture.environment);
  assert.equal(existsSync(join(installed, "index.js")), true);
  assert.equal(existsSync(join(installed, "skills", "next-ticket", "SKILL.md")), true);
  assert.equal(existsSync(join(installed, "opencode-discovery.test.mjs")), false);
  writeFileSync(
    fixture.config,
    JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [installed, installed] }, null, 2),
  );
  let server;

  try {
    const connection = await startServer(fixture);
    ({ server } = connection);
    const { baseUrl, headers } = connection;
    const initialPlugins = await waitFor("installed dod-guard plugin", async () => {
      const result = await request(baseUrl, headers, "/api/plugin");
      const plugins = result.body.data?.filter((plugin) => plugin.id === "dod-guard") ?? [];
      return plugins.length === 1 ? plugins : false;
    });
    assert.equal(initialPlugins.length, 1, JSON.stringify(initialPlugins));
    assert.equal(initialPlugins[0].source.path, join(installed, "index.js"));

    const initialSkills = await request(baseUrl, headers, "/api/skill");
    assert.equal(initialSkills.response.status, 200, JSON.stringify(initialSkills.body));
    assert.equal(initialSkills.body.data.filter((skill) => skill.id === "next-ticket").length, 1);
    const initialAgent = await request(baseUrl, headers, "/api/agent/doc-conflict-judge");
    assert.equal(initialAgent.response.status, 200, JSON.stringify(initialAgent.body));

    writeFileSync(
      fixture.config,
      JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [upgraded, upgraded] }, null, 2),
    );
    const reload = spawnSync(OPENCODE, ["reload", "--server", baseUrl], {
      cwd: fixture.project,
      env: fixture.environment,
      encoding: "utf8",
    });
    assert.equal(reload.status, 0, reload.stderr);
    const upgradedPlugins = await waitFor("reloaded dod-guard plugin", async () => {
      const result = await request(baseUrl, headers, "/api/plugin");
      const plugins = result.body.data?.filter((plugin) => plugin.id === "dod-guard") ?? [];
      return plugins.length === 1 && plugins[0].source.path === join(upgraded, "index.js") ? plugins : false;
    });
    assert.equal(upgradedPlugins.length, 1, JSON.stringify(upgradedPlugins));

    const upgradedSkills = await request(baseUrl, headers, "/api/skill");
    assert.equal(upgradedSkills.response.status, 200, JSON.stringify(upgradedSkills.body));
    assert.equal(upgradedSkills.body.data.filter((skill) => skill.id === "next-ticket").length, 1);
    const upgradedAgent = await request(baseUrl, headers, "/api/agent/doc-conflict-judge");
    assert.equal(upgradedAgent.response.status, 200, JSON.stringify(upgradedAgent.body));
  } finally {
    if (server) await stop(server);
    rmSync(fixture.fixture, { recursive: true, force: true });
    assert.equal(existsSync(fixture.fixture), false);
  }
});

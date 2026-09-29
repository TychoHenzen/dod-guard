import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OPENCODE = process.env.OPENCODE_BIN?.trim() || "opencode";
const NPM_COMMAND = process.platform === "win32" ? process.execPath : "npm";
const NPM_PREFIX = process.platform === "win32" ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")] : [];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(baseUrl, headers, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { body, response };
}

async function waitFor(label, check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function stop(process) {
  if (process.exitCode !== null) return;
  process.kill();
  await new Promise((resolve) => process.once("exit", resolve));
}

function assertSupportedOpenCode() {
  const version = spawnSync(OPENCODE, ["--version"], { encoding: "utf8" });
  assert.equal(
    version.status,
    0,
    version.error
      ? `OpenCode CLI not found: ${OPENCODE}. Install OpenCode v2.0.18 and add \'opencode\' to PATH, or set OPENCODE_BIN to its executable path. ${version.error.message}`
      : version.stderr,
  );
  assert.match(version.stdout, /^opencode v2\.0\.18\s*$/);
}

function installLocalPackage(source, target, environment) {
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "package.json"), "{}\n");
  const result = spawnSync(
    NPM_COMMAND,
    [
      ...NPM_PREFIX,
      "install",
      "--prefix",
      target,
      "--no-save",
      "--no-package-lock",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--install-links",
      source,
    ],
    { cwd: target, env: environment, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return join(target, "node_modules", "@tychohenzen", "dod-guard-opencode");
}

function createFixture(plugins, configContents = JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins }, null, 2)) {
  const fixture = mkdtempSync(join(tmpdir(), "dod-guard-opencode-"));
  const project = join(fixture, "project");
  const configHome = join(fixture, "config");
  const home = join(fixture, "home");
  const dataHome = join(fixture, "data");
  const cacheHome = join(fixture, "cache");
  const stateHome = join(fixture, "state");
  const config = join(project, "opencode.json");
  for (const directory of [project, configHome, home, dataHome, cacheHome, stateHome]) {
    mkdirSync(directory, { recursive: true });
  }
  if (configContents !== null) writeFileSync(config, configContents);
  return {
    fixture,
    project,
    config,
    environment: {
      ...process.env,
      APPDATA: join(fixture, "appdata"),
      LOCALAPPDATA: join(fixture, "localappdata"),
      XDG_CACHE_HOME: cacheHome,
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: dataHome,
      XDG_STATE_HOME: stateHome,
      HOME: home,
      USERPROFILE: home,
      OPENCODE_DB: join(fixture, "opencode.db"),
      OPENCODE_SERVER_PASSWORD: "test",
    },
  };
}

async function assertNoDodGuardRegistration(baseUrl, headers, label) {
  let absentChecks = 0;
  await waitFor(`${label} plugin state`, async () => {
    const result = await request(baseUrl, headers, "/api/plugin");
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const plugins = result.body.data ?? [];
    assert.equal(plugins.some((plugin) => plugin.id === "dod-guard"), false, JSON.stringify(plugins));
    absentChecks += 1;
    return absentChecks >= 3 ? true : false;
  });
}

async function startServer(fixture) {
  const server = spawn(OPENCODE, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: fixture.project,
    env: fixture.environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const headers = {
    Authorization: `Basic ${Buffer.from("opencode:test").toString("base64")}`,
  };
  let baseUrl;
  try {
    const port = await waitFor("OpenCode server port", () => {
      if (server.exitCode !== null) throw new Error(`OpenCode exited before serving:\n${stderr}`);
      return Number(stdout.match(/server listening on http:\/\/127\.0\.0\.1:(\d+)/)?.[1]) || false;
    });
    baseUrl = `http://127.0.0.1:${port}`;
    await waitFor("OpenCode server", async () => {
      if (server.exitCode !== null) throw new Error(`OpenCode exited before serving:\n${stderr}`);
      try {
        const { response } = await request(baseUrl, headers, "/global/health");
        return response.ok;
      } catch {
        return false;
      }
    });
  } catch (error) {
    await stop(server);
    throw error;
  }
  return { server, stderr, headers, baseUrl };
}

test("loads dod-guard through a disposable OpenCode v2.0.18 project", async () => {
  assertSupportedOpenCode();
  const fixture = createFixture([ROOT]);
  let server;

  try {
    const connection = await startServer(fixture);
    ({ server } = connection);
    const { baseUrl, headers } = connection;

    const configResult = await request(baseUrl, headers, "/api/config");
    assert.equal(configResult.response.status, 200, JSON.stringify(configResult.body));
    assert.ok(
      configResult.body.some(
        (source) => source.path === fixture.config && source.info.plugins?.includes(ROOT),
      ),
      `OpenCode did not resolve ${fixture.config}: ${JSON.stringify(configResult.body)}`,
    );

    const pluginResult = await waitFor("dod-guard plugin", async () => {
      const result = await request(baseUrl, headers, "/api/plugin");
      return result.body.data?.find((plugin) => plugin.id === "dod-guard") ?? false;
    });
    assert.equal(pluginResult.state.status, "active");
    assert.equal(pluginResult.source.type, "local");

    const checkResult = await request(baseUrl, headers, "/api/plugin/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(checkResult.response.status, 200, JSON.stringify(checkResult.body));
    assert.equal(checkResult.body.data.find((plugin) => plugin.id === "dod-guard")?.state.status, "active");

    const skillsResult = await request(baseUrl, headers, "/api/skill");
    assert.equal(skillsResult.response.status, 200, JSON.stringify(skillsResult.body));
    assert.match(
      skillsResult.body.data.find((skill) => skill.id === "next-ticket")?.path ?? "",
      /next-ticket[\\/]SKILL\.md$/,
    );

    const agentResult = await request(baseUrl, headers, "/api/agent/review-pr-feature");
    assert.equal(agentResult.response.status, 200, JSON.stringify(agentResult.body));
    assert.equal(agentResult.body.data.id, "review-pr-feature");
    assert.equal(agentResult.body.data.mode, "subagent");

    const sessionResult = await request(baseUrl, headers, "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "dod-guard discovery fixture" }),
    });
    assert.equal(sessionResult.response.status, 200, JSON.stringify(sessionResult.body));
    const sessionId = sessionResult.body.data.id;
    const invokeResult = await request(baseUrl, headers, `/api/experimental/session/${sessionId}/skill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "next-ticket", resume: false }),
    });
    assert.equal(invokeResult.response.status, 204, JSON.stringify(invokeResult.body));

    const messagesResult = await request(baseUrl, headers, `/api/session/${sessionId}/message`);
    assert.equal(messagesResult.response.status, 200, JSON.stringify(messagesResult.body));
    assert.ok(messagesResult.body.data.some((message) => message.type === "skill" && message.skill === "next-ticket"));

    const promptText = "Use the next-ticket skill with the review-pr-feature agent.";
    const promptResult = await request(baseUrl, headers, `/api/session/${sessionId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: promptText,
        skills: [{ id: "next-ticket" }],
        agents: [{ name: "review-pr-feature" }],
        resume: false,
      }),
    });
    assert.equal(promptResult.response.status, 200, JSON.stringify(promptResult.body));
    assert.equal(promptResult.body.data.type, "user", JSON.stringify(promptResult.body));
    assert.equal(promptResult.body.data.payload.text, promptText);
    assert.deepEqual(promptResult.body.data.payload.skills.map((skill) => skill.id), ["next-ticket"]);
    assert.deepEqual(promptResult.body.data.payload.agents.map((agent) => agent.name), ["review-pr-feature"]);
  } finally {
    if (server) await stop(server);
    rmSync(fixture.fixture, { recursive: true, force: true });
    assert.equal(existsSync(fixture.fixture), false);
  }
});

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
  writeFileSync(fixture.config, JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [installed, installed] }, null, 2));
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
    const initialAgent = await request(baseUrl, headers, "/api/agent/review-pr-feature");
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
    const upgradedAgent = await request(baseUrl, headers, "/api/agent/review-pr-feature");
    assert.equal(upgradedAgent.response.status, 200, JSON.stringify(upgradedAgent.body));
  } finally {
    if (server) await stop(server);
    rmSync(fixture.fixture, { recursive: true, force: true });
    assert.equal(existsSync(fixture.fixture), false);
  }
});

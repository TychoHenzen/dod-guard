import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OPENCODE = "C:\\Users\\siriu\\AppData\\Local\\Programs\\@opencodedesktop\\resources\\opencode-cli.exe";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
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

test("loads dod-guard through a disposable OpenCode v2.0.18 project", async () => {
  assert.equal(existsSync(OPENCODE), true, `missing pinned OpenCode CLI: ${OPENCODE}`);
  const version = spawnSync(OPENCODE, ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^opencode v2\.0\.18\s*$/);

  const fixture = mkdtempSync(join(tmpdir(), "dod-guard-opencode-"));
  const project = join(fixture, "project");
  const configHome = join(fixture, "config");
  const home = join(fixture, "home");
  const dataHome = join(fixture, "data");
  const cacheHome = join(fixture, "cache");
  const stateHome = join(fixture, "state");
  const config = join(project, "opencode.json");
  const serverPassword = "test";
  let server;

  try {
    for (const directory of [project, configHome, home, dataHome, cacheHome, stateHome]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(
      config,
      JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          plugins: [ROOT],
        },
        null,
        2,
      ),
    );
    const port = await freePort();
    const environment = {
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
      OPENCODE_SERVER_PASSWORD: serverPassword,
    };
    server = spawn(OPENCODE, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: project,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    server.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const headers = {
      Authorization: `Basic ${Buffer.from(`opencode:${serverPassword}`).toString("base64")}`,
    };
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitFor("OpenCode server", async () => {
      if (server.exitCode !== null) throw new Error(`OpenCode exited before serving:\n${stderr}`);
      try {
        const { response } = await request(baseUrl, headers, "/global/health");
        return response.ok;
      } catch {
        return false;
      }
    });

    const configResult = await request(baseUrl, headers, "/api/config");
    assert.equal(configResult.response.status, 200, JSON.stringify(configResult.body));
    assert.ok(
      configResult.body.some(
        (source) => source.path === config && source.info.plugins?.includes(ROOT),
      ),
      `OpenCode did not resolve ${config}: ${JSON.stringify(configResult.body)}`,
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
  } finally {
    if (server) await stop(server);
    rmSync(fixture, { recursive: true, force: true });
    assert.equal(existsSync(fixture), false);
  }
});

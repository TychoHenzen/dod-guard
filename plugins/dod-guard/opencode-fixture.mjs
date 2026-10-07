import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Shared setup for the OpenCode discovery and reload tests: a disposable project,
// isolated config homes, and a served OpenCode instance.
export const ROOT = dirname(fileURLToPath(import.meta.url));
export const OPENCODE = process.env.OPENCODE_BIN?.trim() || "opencode";
const NPM_COMMAND = process.platform === "win32" ? process.execPath : "npm";
const NPM_PREFIX =
  process.platform === "win32" ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")] : [];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function request(baseUrl, headers, path, options = {}) {
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

export async function waitFor(label, check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function stop(process) {
  if (process.exitCode !== null) return;
  process.kill();
  await new Promise((resolve) => process.once("exit", resolve));
}

export function assertSupportedOpenCode() {
  const version = spawnSync(OPENCODE, ["--version"], { encoding: "utf8" });
  assert.equal(
    version.status,
    0,
    version.error
      ? `OpenCode CLI not found: ${OPENCODE}. Install OpenCode v2.0.18 and add 'opencode' to PATH, ` +
          `or set OPENCODE_BIN to its executable path. ${version.error.message}`
      : version.stderr,
  );
  assert.match(version.stdout, /^opencode v2\.0\.18\s*$/);
}

export function installLocalPackage(source, target, environment) {
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

export function createFixture(
  plugins,
  configContents = JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins }, null, 2),
) {
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

export async function assertNoDodGuardRegistration(baseUrl, headers, label) {
  let absentChecks = 0;
  await waitFor(`${label} plugin state`, async () => {
    const result = await request(baseUrl, headers, "/api/plugin");
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const plugins = result.body.data ?? [];
    assert.equal(
      plugins.some((plugin) => plugin.id === "dod-guard"),
      false,
      JSON.stringify(plugins),
    );
    absentChecks += 1;
    return absentChecks >= 3 ? true : false;
  });
}

export async function startServer(fixture) {
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

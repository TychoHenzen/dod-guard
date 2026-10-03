import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ecosystem from "./ecosystem.config.cjs";
import {
  parseLauncherOptions,
  renderMcpRegistrationConfig,
  resolveNewestBundle,
  startService,
} from "./launcher.mjs";

async function bundle(root, service, version) {
  const location = join(root, service, version, "dist");
  await mkdir(location, { recursive: true });
  const packageRoot = join(location, "..");
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: service, version }), "utf8");
  const file = join(location, "bundle.js");
  await writeFile(file, "// synthetic bundle\n", "utf8");
  return file;
}

test("selects the newest semantic-versioned bundle deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcp-host-cache-"));
  try {
    await bundle(root, "quality-guard", "0.5.9");
    const newest = await bundle(root, "quality-guard", "0.5.15");
    assert.equal(resolveNewestBundle({ service: "quality-guard", roots: [root] }), newest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports missing and same-version ambiguous bundles", async () => {
  const one = await mkdtemp(join(tmpdir(), "mcp-host-one-"));
  const two = await mkdtemp(join(tmpdir(), "mcp-host-two-"));
  try {
    assert.throws(
      () => resolveNewestBundle({ service: "quality-guard", roots: [join(one, "missing")] }),
      /no installed quality-guard bundle/,
    );
    await bundle(one, "quality-guard", "0.5.15");
    await bundle(two, "quality-guard", "0.5.15");
    assert.throws(
      () => resolveNewestBundle({ service: "quality-guard", roots: [one, two] }),
      /ambiguous quality-guard bundle version 0\.5\.15/,
    );
  } finally {
    await Promise.all([
      rm(one, { recursive: true, force: true }),
      rm(two, { recursive: true, force: true }),
    ]);
  }
});

test("parses service-specific endpoints and requires a knowledge corpus root", () => {
  const options = parseLauncherOptions(
    ["--service", "knowledge-base", "--port=21999"],
    { MCP_HOST_BIND_HOST: "127.0.0.1", DOD_GUARD_KNOWLEDGE_BASE_DIR: "C:/vault" },
  );
  assert.deepEqual(options, {
    service: "knowledge-base",
    host: "127.0.0.1",
    port: 21_999,
    path: "/servers/knowledge-base/mcp",
    healthPath: "/servers/knowledge-base/health",
    bundle: undefined,
    rootDir: "C:/vault",
  });
});

test("renders client registrations from the same configurable endpoints as PM2", () => {
  assert.deepEqual(
    renderMcpRegistrationConfig({
      MCP_HOST_BIND_HOST: "localhost",
      MCP_HOST_QUALITY_GUARD_PORT: "21920",
      MCP_HOST_QUALITY_GUARD_PATH: "/quality/",
      MCP_HOST_KNOWLEDGE_BASE_PORT: "21921",
      MCP_HOST_KNOWLEDGE_BASE_PATH: "/knowledge/mcp/",
    }),
    {
      mcpServers: {
        "quality-guard": {
          type: "http",
          url: "http://localhost:21920/quality",
        },
        "knowledge-base": {
          type: "http",
          url: "http://localhost:21921/knowledge/mcp",
        },
      },
    },
  );
  assert.throws(
    () => renderMcpRegistrationConfig({ MCP_HOST_BIND_HOST: "0.0.0.0" }),
    /loopback-only/,
  );
});

test("starts one validated bundle export and returns its lifecycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcp-host-start-"));
  const bundlePath = join(root, "bundle.js");
  try {
    await writeFile(bundlePath, "// synthetic bundle\n", "utf8");
    let received;
    let closed = 0;
    const running = await startService({
      options: {
        service: "quality-guard",
        host: "127.0.0.1",
        port: 21_720,
        path: "/mcp",
        healthPath: "/health",
        bundle: bundlePath,
      },
      importModule: async () => ({
        startQualityGuardHttpServer: async (options) => {
          received = options;
          return { ...options, port: 21_720, close: async () => { closed += 1; } };
        },
      }),
    });
    assert.equal(running.bundle, bundlePath);
    assert.deepEqual(received, {
      host: "127.0.0.1",
      port: 21_720,
      path: "/mcp",
      healthPath: "/health",
    });
    await running.close();
    assert.equal(closed, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PM2 defines exactly one loopback app per service with distinct defaults", () => {
  assert.equal(ecosystem.apps.length, 2);
  assert.deepEqual(ecosystem.apps.map((app) => app.name), ["dod-guard-quality-guard", "dod-guard-knowledge-base"]);
  assert.equal(ecosystem.apps[0].env.MCP_HOST_QUALITY_GUARD_PORT, "21720");
  assert.equal(ecosystem.apps[1].env.MCP_HOST_KNOWLEDGE_BASE_PORT, "21721");
  assert.ok(ecosystem.apps.every((app) => app.env.MCP_HOST_BIND_HOST === "127.0.0.1"));
});

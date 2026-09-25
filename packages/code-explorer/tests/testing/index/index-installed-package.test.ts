import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as stdio from "@modelcontextprotocol/sdk/client/stdio.js";
import { removeTemporaryTree } from "./index-test-standalone-support.js";

const { StdioClientTransport } = stdio;
const entryPoint = fileURLToPath(
  new URL("../../../src/index.js", import.meta.url),
);
const backendStatusTimeoutMs = 30_000;
const backendStatusPollMs = 50;

type InstalledBackend = {
  language: string;
  state: string;
  failure_code?: string;
};

type InstalledStatusResponse = {
  data: { backend_status: { backends: InstalledBackend[] } };
};

async function waitForInstalledBackends(client: Client) {
  const deadline = Date.now() + backendStatusTimeoutMs;
  let backends: InstalledBackend[] = [];
  for (;;) {
    const response = (await client.callTool({
      name: "code_status",
      arguments: { action: "status" },
    })) as { content: Array<{ text: string }> };
    const envelope = JSON.parse(
      response.content[0]?.text ?? "",
    ) as InstalledStatusResponse;
    backends = envelope.data.backend_status.backends;
    if (
      backends.length === 3 &&
      backends.every(({ state }) => state !== "initializing")
    )
      return backends;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(
        `installed_backend_status_timeout:${JSON.stringify(backends)}`,
      );
    await new Promise((resolve_) =>
      setTimeout(resolve_, Math.min(backendStatusPollMs, remaining)),
    );
  }
}

it(
  "keeps the production bundle free of spike and rejected-dependency " +
    "imports",
  () => {
    const bundle = readFileSync(
      join(dirname(dirname(dirname(entryPoint))), "dist", "bundle.js"),
      "utf8",
    );
    assert.equal(
      /(?:import|require)\([^)]*(?:spike|serena|@p1va\/symbols)/i.test(bundle),
      false,
    );
    assert.equal(/node_modules[\\/](?:serena|@p1va)[\\/]/i.test(bundle), false);
  },
);

it(
  "runs the bundled installed package with only its production record and " +
    "no spike tree",
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), "code-explorer-installed-"));
    const installed = join(temporary, "node_modules", "code-explorer");
    const project = join(temporary, "project");
    const packageRoot = dirname(dirname(dirname(entryPoint)));
    mkdirSync(join(installed, "dist"), { recursive: true });
    mkdirSync(project);
    copyFileSync(
      join(packageRoot, "dist", "bundle.js"),
      join(installed, "dist", "bundle.js"),
    );
    copyFileSync(
      join(packageRoot, "package.json"),
      join(installed, "package.json"),
    );
    copyFileSync(
      join(packageRoot, "adapter-selection.json"),
      join(installed, "adapter-selection.json"),
    );
    copyFileSync(
      join(packageRoot, "adapter-selection-evidence.json"),
      join(installed, "adapter-selection-evidence.json"),
    );
    const client = new Client({
      name: "code-explorer-installed-test",
      version: "1.0.0",
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(installed, "dist", "bundle.js"), "--project-root", project],
      env: { PATH: "" },
    });
    try {
      await client.connect(transport);
      const backends = await waitForInstalledBackends(client);
      assert.deepEqual(
        backends.map(({ language }) => language),
        ["rust", "python", "csharp"],
      );
      const csharp = backends.find(({ language }) => language === "csharp");
      assert.ok(csharp?.state === "ready" || csharp?.state === "unavailable");
      if (csharp?.state === "unavailable")
        assert.equal(csharp.failure_code, "backend_unavailable");
    } finally {
      try {
        await client.close();
      } finally {
        await removeTemporaryTree(temporary);
      }
    }
  },
);

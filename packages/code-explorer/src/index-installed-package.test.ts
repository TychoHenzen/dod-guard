import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { removeTemporaryTree } from "./testing/index-test-standalone-support.js";

const entryPoint = fileURLToPath(new URL("./index.js", import.meta.url));

it("keeps the production bundle free of spike and rejected-dependency imports", () => {
  const bundle = readFileSync(join(dirname(dirname(entryPoint)), "dist", "bundle.js"), "utf8");
  assert.equal(/(?:import|require)\([^)]*(?:spike|serena|@p1va\/symbols)/i.test(bundle), false);
  assert.equal(/node_modules[\\/](?:serena|@p1va)[\\/]/i.test(bundle), false);
});

it("runs the bundled installed package with only its production record and no spike tree", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-installed-"));
  const installed = join(temporary, "node_modules", "code-explorer");
  const project = join(temporary, "project");
  const packageRoot = dirname(dirname(entryPoint));
  mkdirSync(join(installed, "dist"), { recursive: true });
  mkdirSync(project);
  copyFileSync(join(packageRoot, "dist", "bundle.js"), join(installed, "dist", "bundle.js"));
  copyFileSync(join(packageRoot, "package.json"), join(installed, "package.json"));
  copyFileSync(join(packageRoot, "adapter-selection.json"), join(installed, "adapter-selection.json"));
  copyFileSync(join(packageRoot, "adapter-selection-evidence.json"), join(installed, "adapter-selection-evidence.json"));
  const client = new Client({ name: "code-explorer-installed-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(installed, "dist", "bundle.js"), "--project-root", project], env: { PATH: "" } });
  try {
    await client.connect(transport);
    let backends: Array<{ language: string; state: string; failure_code?: string }> = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = (await client.callTool({ name: "code_status", arguments: { action: "status" } })) as { content: Array<{ text: string }> };
      const envelope = JSON.parse(response.content[0]?.text ?? "") as { data: { backend_status: { backends: Array<{ language: string; state: string; failure_code?: string }> } } };
      backends = envelope.data.backend_status.backends;
      if (backends.every(({ state }) => state !== "initializing")) break;
      await new Promise((resolve_) => setTimeout(resolve_, 20));
    }
    assert.deepEqual(backends.map(({ language }) => language), ["rust", "python", "csharp"]);
    assert.ok(backends.every(({ state }) => state !== "initializing"));
    const csharp = backends.find(({ language }) => language === "csharp");
    assert.ok(csharp?.state === "ready" || csharp?.state === "unavailable");
    if (csharp?.state === "unavailable") assert.equal(csharp.failure_code, "backend_unavailable");
  } finally {
    await client.close();
    await removeTemporaryTree(temporary);
  }
});

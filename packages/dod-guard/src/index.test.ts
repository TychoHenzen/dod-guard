import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { build } from "esbuild";
import { runCoverage } from "./cover/run.js";
import { createServer } from "./index.js";
import { writeChangeSpecDelta, writeChangeTasks, writeUnwiredCoverageGateSpec } from "./testing/spec-fixtures.js";

const COVERS = "<!-- covers: dod-guard/coverage-gate :: a new requirement :: a new scenario -->";
const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

describe("plugin-native cover", () => {
  let cwd: string;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-plugin-cover-"));
    await writeUnwiredCoverageGateSpec(cwd);
  });

  after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("registers cover and runs the shared engine for the supplied consumer workspace", async () => {
    const server = createServer();
    const client = new Client({ name: "dod-guard-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "cover"));

    const result = await client.callTool({ name: "cover", arguments: { cwd, all: true } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      reports: [
        {
          scenarioId: "dod-guard/coverage-gate::cover reports a scenario's state||unwired",
          group: "dod-guard",
          capability: "coverage-gate",
          requirementTitle: "cover reports a scenario's state",
          scenarioTitle: "unwired",
          outcome: "unwired",
          note: "no test binds this scenario",
        },
      ],
      adopted: ["dod-guard/coverage-gate::cover reports a scenario's state||unwired"],
      regressions: [],
      improved: [],
      orphaned: [],
    });

    await Promise.all([client.close(), server.close()]);
  });

  // covers: dod-guard/coverage-runtime :: The installed plugin exposes the coverage engine :: A consumer invokes coverage after plugin installation
  it("runs cover from a plugin installed in the consumer workspace", async () => {
    const consumerWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-consumer-"));
    const installedPackage = path.join(consumerWorkspace, "node_modules", "dod-guard");
    const installedBundle = path.join(installedPackage, "dist", "bundle.js");
    await fs.mkdir(path.dirname(installedBundle), { recursive: true });
    await Promise.all([
      fs.copyFile(path.join(PACKAGE_ROOT, "package.json"), path.join(installedPackage, "package.json")),
      writeUnwiredCoverageGateSpec(consumerWorkspace),
      build({
        entryPoints: [path.join(PACKAGE_ROOT, "src", "index.ts")],
        bundle: true,
        platform: "node",
        target: "node18",
        format: "esm",
        outfile: installedBundle,
      }),
    ]);

    const client = new Client({ name: "dod-guard-consumer", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [installedBundle],
      cwd: consumerWorkspace,
    });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.ok(tools.tools.some((tool) => tool.name === "cover"));
      assert.ok(installedBundle.startsWith(consumerWorkspace));
      assert.ok(!installedBundle.startsWith(PACKAGE_ROOT));

      const result = await client.callTool({ name: "cover", arguments: { cwd: consumerWorkspace, all: true } });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, {
        reports: [
          {
            scenarioId: "dod-guard/coverage-gate::cover reports a scenario's state||unwired",
            group: "dod-guard",
            capability: "coverage-gate",
            requirementTitle: "cover reports a scenario's state",
            scenarioTitle: "unwired",
            outcome: "unwired",
            note: "no test binds this scenario",
          },
        ],
        adopted: ["dod-guard/coverage-gate::cover reports a scenario's state||unwired"],
        regressions: [],
        improved: [],
        orphaned: [],
      });
    } finally {
      await client.close();
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      await fs.rm(consumerWorkspace, { recursive: true, force: true });
    }
  });

  it("serializes an unwired scenario with ratchet and plan-check results", async () => {
    const changeId = "structured-result";
    const scenarioId = "dod-guard/coverage-gate::a new requirement||a new scenario";
    await writeChangeSpecDelta(cwd, changeId);
    await writeChangeTasks(
      cwd,
      changeId,
      ["## 1. Setup", "", "- [ ] 1.1 do something", "", "## 2. Unexpanded", "", COVERS, ""].join("\n"),
    );
    const baselinePath = path.join(cwd, ".github", "quality", "coverage-gate-baseline.json");
    await fs.mkdir(path.dirname(baselinePath), { recursive: true });
    await fs.writeFile(baselinePath, JSON.stringify({ scenarios: { [scenarioId]: "bound" } }));

    const server = createServer();
    const client = new Client({ name: "dod-guard-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: "cover", arguments: { cwd, changeId } });
    const serialized = JSON.parse((result.content as { type: "text"; text: string }[])[0].text);

    assert.deepEqual(result.structuredContent, serialized);
    assert.equal(serialized.reports[0].scenarioId, scenarioId);
    assert.equal(serialized.reports[0].outcome, "unwired");
    assert.equal(serialized.reports[0].binding, undefined);
    assert.deepEqual(serialized.regressions, [{ scenarioId, before: "bound", now: "unwired" }]);
    assert.equal(serialized.planComplete, 4);
    assert.equal(serialized.planBound, 5);

    await Promise.all([client.close(), server.close()]);
  });

  // covers: dod-guard/coverage-runtime :: The installed plugin exposes the coverage engine :: Shell and plugin callers use the same engine
  it("returns the same coverage result for shell and plugin callers", async (t) => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-cover-equivalence-"));
    t.after(async () => {
      await fs.rm(workspace, { recursive: true, force: true });
    });

    const changeId = "equivalent-coverage";
    const scenarioId = "dod-guard/coverage-gate::a new requirement||a new scenario";
    await writeChangeSpecDelta(workspace, changeId);
    await writeChangeTasks(
      workspace,
      changeId,
      ["## 1. Setup", "", "- [ ] 1.1 do something", "", "## 2. Unexpanded", ""].join("\n"),
    );
    const baselinePath = path.join(workspace, ".github", "quality", "coverage-gate-baseline.json");
    await fs.mkdir(path.dirname(baselinePath), { recursive: true });
    await fs.writeFile(baselinePath, JSON.stringify({ scenarios: { [scenarioId]: "bound" } }));

    const options = { cwd: workspace, changeId, all: false, writeBaseline: false };
    const shellResult = await runCoverage(options);
    const server = createServer();
    const client = new Client({ name: "dod-guard-equivalence", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const pluginResult = await client.callTool({ name: "cover", arguments: { cwd: workspace, changeId } });

      assert.equal(pluginResult.isError, undefined);
      assert.deepEqual(pluginResult.structuredContent, shellResult);
      assert.equal(shellResult.reports[0].outcome, "unwired");
      assert.deepEqual(shellResult.regressions, [{ scenarioId, before: "bound", now: "unwired" }]);
      assert.equal(shellResult.planComplete, 4);
      assert.equal(shellResult.planBound, 5);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});

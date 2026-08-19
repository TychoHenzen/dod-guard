import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index.js";
import { writeChangeSpecDelta, writeChangeTasks, writeUnwiredCoverageGateSpec } from "./testing/spec-fixtures.js";

const COVERS = "<!-- covers: dod-guard/coverage-gate :: a new requirement :: a new scenario -->";

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
});

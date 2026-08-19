import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index.js";
import { writeUnwiredCoverageGateSpec } from "./testing/spec-fixtures.js";

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
});

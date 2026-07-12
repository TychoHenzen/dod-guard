import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { EvoError } from "./operations.js";

// ── Mock MCP SDK to cover server.tool registration ────────────────────────

const registeredTools: { name: string; schema: any; desc: string }[] = [];

const mockTool = mock.fn((name: string, desc: string, schema: any, _handler?: any) => {
  registeredTools.push({ name, schema: schema ?? {}, desc });
});

const mockConnect = mock.fn(async () => {});

function MockMcpServer(this: any, _opts: any) {
  this.tool = mockTool;
  this.connect = mockConnect;
  return this;
}

mock.module("@modelcontextprotocol/sdk/server/mcp.js", {
  namedExports: {
    McpServer: MockMcpServer as any,
  },
});

mock.module("@modelcontextprotocol/sdk/server/stdio.js", {
  namedExports: {
    StdioServerTransport: (() => ({})) as any,
  },
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("gitevo index", () => {
  let mod: any;

  before(async () => {
    registeredTools.length = 0;
    mod = await import("./index.js");
  });

  describe("wrap", () => {
    it("returns result on success", () => assert.equal(mod.wrap(() => "ok")(), "ok"));
    it("catches EvoError", () => {
      const r = mod.wrap(() => {
        throw new EvoError("init not run");
      })();
      assert.ok(r.startsWith("ERROR: "));
      assert.ok(r.includes("init not run"));
    });
    it("catches generic Error", () => {
      const r = mod.wrap(() => {
        throw new Error("boom");
      })();
      assert.ok(r.startsWith("ERROR: "));
      assert.ok(r.includes("boom"));
    });
    it("catches non-Error throw", () => {
      const r = mod.wrap(() => {
        throw "raw";
      })();
      assert.ok(r.startsWith("ERROR: "));
      assert.ok(r.includes("raw"));
    });
    it("passes arguments", () => assert.equal(mod.wrap((a: number, b: number) => `${a + b}`)(3, 4), "7"));
  });

  describe("tool registration", () => {
    it("registers 13 tools", () => assert.equal(registeredTools.length, 13));

    it("evo_init no params", () => {
      const t = registeredTools.find((t) => t.name === "evo_init");
      assert.ok(t);
      assert.deepStrictEqual(t.schema, {});
    });

    it("evo_checkpoint has schema", () => {
      const t = registeredTools.find((t) => t.name === "evo_checkpoint");
      assert.ok(t?.schema.name);
      assert.ok(t?.schema.description);
    });

    it("evo_spawn has schema", () => {
      const t = registeredTools.find((t) => t.name === "evo_spawn");
      assert.ok(t?.schema.checkpoint_name);
      assert.ok(t?.schema.new_branch);
    });

    it("evo_learn has content param", () => {
      const t = registeredTools.find((t) => t.name === "evo_learn");
      assert.ok(t?.schema.content);
    });

    it("evo_abandon has optional params", () => {
      const t = registeredTools.find((t) => t.name === "evo_abandon");
      assert.ok(t?.schema.checkpoint);
      assert.ok(t?.schema.reason);
    });

    it("evo_diff has two params", () => {
      const t = registeredTools.find((t) => t.name === "evo_diff");
      assert.ok(t?.schema.checkpoint_a);
      assert.ok(t?.schema.checkpoint_b);
    });

    it("evo_adopt has branch param", () => {
      const t = registeredTools.find((t) => t.name === "evo_adopt");
      assert.ok(t?.schema.branch);
    });

    it("param-less tools registered", () => {
      for (const name of [
        "evo_summary",
        "evo_checkpoints",
        "evo_branches",
        "evo_lessons",
        "evo_export_lessons",
        "evo_finish",
      ]) {
        assert.ok(
          registeredTools.find((t) => t.name === name),
          `missing: ${name}`,
        );
      }
    });
  });

  describe("EvoError", () => {
    it("is instanceof Error", () => assert.ok(new EvoError("t") instanceof Error));
    it("is instanceof EvoError", () => assert.ok(new EvoError("t") instanceof EvoError));
    it("has message", () => assert.equal(new EvoError("msg").message, "msg"));
  });
});

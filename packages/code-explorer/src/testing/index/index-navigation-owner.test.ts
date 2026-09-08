import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../index.js";
import type * as language from "../../semantic/adapters/language-adapter.js";
import { FakeSemanticAdapter } from "../semantic/fake-semantic-adapter.js";
import {
  followDefinition,
  startSession,
  symbol,
} from "./index-test-server-support.js";

type LanguageAdapter = language.LanguageAdapter;

it(
  "keeps the owning language relation when another ready adapter does not " +
    "own the symbol",
  async () => {
    const focused = symbol("function", "src/helper.rs");
    const capabilities = Object.fromEntries(
      [
        "definition",
        "references",
        "type_definition",
        "implementation",
        "callers",
        "callees",
      ].map((name) => [name, { state: "ready" }]),
    ) as never;
    const status = (language: "rust" | "python") => ({
      language,
      backend_name: language,
      backend_version: "test",
      discovery_source: "injected" as const,
      state: "ready" as const,
      capabilities,
      last_transition_time: 0,
    });
    const owner: LanguageAdapter = {
      status: () => status("rust"),
      request: async (request) =>
        request.operation === "focus"
          ? {
              operation: "focus",
              revision: { generation: 1, manifest_sha256: "test" },
              symbol: focused,
              content: {
                body: "helper",
                visible_symbols: [{ name: "helper", symbol_id: focused.id }],
              },
            }
          : {
              operation: "definition",
              revision: { generation: 1, manifest_sha256: "test" },
              relations: [
                {
                  relation: "definition",
                  symbol: focused,
                  location: focused.location,
                },
              ],
            },
    } as LanguageAdapter;
    const unrelated: LanguageAdapter = {
      status: () => status("python"),
      request: async () => {
        throw new Error("backend_unavailable");
      },
    };
    const server = createServer({ adapters: [owner, unrelated] });
    const sessionId = await startSession(server);
    const focus = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "focus-request-00001",
      symbol_id: focused.id,
    });
    if ("code" in focus) throw new Error("expected focus");
    const data = focus.data as {
      view_id: string;
      handles: Array<{ handle: string }>;
    };
    const followed = await followDefinition({
      server,
      sessionId,
      viewId: data.view_id,
      handle: data.handles[0]?.handle ?? "missing",
    });
    assert.equal("code" in followed, false);
    assert.equal("code" in followed ? undefined : followed.state, "ready");
  },
);

it(
  "lets tests control semantic adapter readiness, results, and " + "failures",
  async () => {
    const adapter = new FakeSemanticAdapter<number>();
    assert.deepEqual(adapter.readiness(), { state: "unavailable" });
    adapter.setReady();
    adapter.setResult(7);
    assert.deepEqual(adapter.readiness(), { state: "ready" });
    assert.equal(await adapter.query(), 7);
    adapter.setFailure(new Error("semantic backend stopped"));
    await assert.rejects(adapter.query(), /semantic backend stopped/);
  },
);

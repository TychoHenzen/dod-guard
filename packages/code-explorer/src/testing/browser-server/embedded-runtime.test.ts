import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createEmbeddedBrowserRuntime } from "../../index.js";

const origin = "http://127.0.0.1:4400";

test("serves the package browser and navigation API through an existing listener boundary", async () => {
  const root = mkdtempSync(join(tmpdir(), "embedded-code-explorer-"));
  let closed = 0;
  const calls: Array<[string, Record<string, unknown>]> = [];
  const runtime = await createEmbeddedBrowserRuntime({
    project_root: root,
    origin,
    core_factory: {
      async start() {
        return {
          async call(name, arguments_) {
            calls.push([name, arguments_]);
            if (name === "code_status" && arguments_.action === "start_session") {
              return {
                schema_version: 1,
                project_id: "project",
                project_generation: 1,
                pending_generation: null,
                state: "ready",
                data: { session_id: "core-session" },
              };
            }
            return {
              schema_version: 1,
              project_id: "project",
              project_generation: 1,
              pending_generation: null,
              state: "ready",
              data: {},
            };
          },
          async close() {
            closed += 1;
          },
        };
      },
    },
  });
  try {
    const page = await runtime.handle({
      method: "GET",
      path: "/",
      headers: { host: "127.0.0.1:4400" },
      body: Buffer.alloc(0),
    });
    assert.equal(page.status, 200);
    assert.match(page.body, /src="client\.js"/);
    const created = await runtime.handle({
      method: "POST",
      path: "/api/session",
      headers: {
        host: "127.0.0.1:4400",
        origin,
        "content-type": "application/json",
        "x-code-explorer-tab": "tab-one",
      },
      body: Buffer.from(JSON.stringify({ action: "create", tab_instance_id: "tab-one", document_start: "new" })),
    });
    const browserSession = JSON.parse(created.body).data.browser_session_id;
    const status = await runtime.handle({
      method: "POST",
      path: "/api/status",
      headers: {
        host: "127.0.0.1:4400",
        origin,
        "content-type": "application/json",
        "x-code-explorer-tab": "tab-one",
        "x-code-explorer-session": browserSession,
      },
      body: Buffer.from(JSON.stringify({ action: "status" })),
    });
    assert.equal(status.status, 200);
    assert.deepEqual(
      calls.map(([name]) => name),
      ["code_status", "code_status"],
    );
  } finally {
    await runtime.close();
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(closed, 1);
});

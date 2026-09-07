import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { startSession } from "../support/start-session.js";
import { blockingRefreshAdapter } from "./blocking-refresh-adapter.js";

it(
  "joins an active project refresh instead of starting " +
    "another adapter refresh",
  async () => {
    let refreshes = 0;
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => (release = resolve));
    const server = createServer({
      adapters: [
        blockingRefreshAdapter(() => {
          refreshes += 1;
        }, wait),
      ],
    });
    const one = await startSession(server);
    const two = await startSession(server);
    const first = server.call("code_status", {
      action: "refresh",
      session_id: one,
      request_id: "refresh-request-0001",
    });
    await new Promise((resolve) => setImmediate(resolve));
    const second = server.call("code_status", {
      action: "refresh",
      session_id: two,
      request_id: "refresh-request-0002",
    });
    release?.();
    await Promise.all([first, second]);
    assert.equal(refreshes, 1);
  },
);

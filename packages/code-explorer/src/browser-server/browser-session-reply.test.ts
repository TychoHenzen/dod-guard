import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withBrowserSession } from "./browser-session-reply.js";

describe("browser session replies", () => {
  it("adds the browser session without losing envelope or data fields", () => {
    assert.deepEqual(withBrowserSession({ state: "degraded", data: { root_access: "denied" } }, "browser-1"), {
      state: "degraded",
      data: { root_access: "denied", browser_session_id: "browser-1" },
    });
  });

  it("replaces malformed data with a session object", () => {
    assert.deepEqual(withBrowserSession({ state: "ready", data: ["unexpected"] }, "browser-2"), {
      state: "ready",
      data: { browser_session_id: "browser-2" },
    });
  });
});

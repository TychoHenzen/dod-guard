import assert from "node:assert/strict";
import { test } from "node:test";
import { browserRequest, ownership } from "../../browser/browser-request.js";
import { captureFetchHeaders } from "./fixtures/fetch.test.js";
import { mapStorage } from "./fixtures/storage.test.js";

test(
  "browser requests require and " + "send one stored ownership pair",
  async (context) => {
    const values = new Map([
      ["browser_session_id", "session"],
      ["tab_instance_id", "tab"],
    ]);
    const storage = mapStorage(values);
    const captured = captureFetchHeaders();
    context.after(captured.restore);
    assert.deepEqual(ownership(storage), {
      "x-code-explorer-session": "session",
      "x-code-explorer-tab": "tab",
    });
    await browserRequest(storage, "/api/status", { action: "status" });
    assert.deepEqual(captured.headers(), {
      "content-type": "application/json",
      "x-code-explorer-session": "session",
      "x-code-explorer-tab": "tab",
    });
    values.clear();
    await assert.rejects(
      () => browserRequest(storage, "/api/status", {}),
      /invalid_browser_session/,
    );
  },
);

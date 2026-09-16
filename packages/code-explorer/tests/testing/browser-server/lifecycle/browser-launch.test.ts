import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startService } from "./server-fixture.js";

describe("browser server lifecycle", () => {
  it("prints once then opens the exact listening URL", async () => {
    const opened: string[] = [];
    const lines: string[] = [];
    const service = await startService({
      no_open: false,
      opener: {
        open: async (url) => {
          opened.push(url.href);
        },
      },
      write: (line) => lines.push(line),
    });
    assert.deepEqual(lines, ["Code Explorer: http://127.0.0.1:4410/"]);
    assert.deepEqual(opened, ["http://127.0.0.1:4410/"]);
    await service.close();
  });
  it("does not request a browser launch for no-open", async () => {
    let opened = false;
    const service = await startService({
      no_open: true,
      opener: {
        open: async () => {
          opened = true;
        },
      },
    });
    assert.equal(opened, false);
    await service.close();
  });
  it("keeps serving when browser opening fails", async () => {
    const errors: string[] = [];
    const service = await startService({
      no_open: false,
      opener: {
        open: async () => {
          throw new Error("spawn failed");
        },
      },
      writeError: (line) => errors.push(line),
    });
    assert.deepEqual(errors, ["browser_open_failed"]);
    await service.close();
  });
});

import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

/** Branch names passed to git checkout, in order. */
const checkouts: string[] = [];
/** Reasons passed to the gitevo abandon, in order. */
const abandons: string[] = [];
let checkoutFails = false;

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((cmd: string) => {
      const text = String(cmd);
      if (text.startsWith("git checkout")) {
        if (checkoutFails) throw new Error("no such branch");
        checkouts.push(text.replace("git checkout ", ""));
      }
      return Buffer.from("");
    }),
  },
});

mock.module("./gitevo-integration.js", {
  namedExports: {
    abandonLoser: mock.fn(async (_branch: string, reason: string) => {
      abandons.push(reason);
    }),
  },
});

describe("abandonBranch", () => {
  let abandonBranch: any;
  let discardAttempt: any;

  before(async () => {
    const mod = await import("./solve-abandon.js");
    abandonBranch = mod.abandonBranch;
    discardAttempt = mod.discardAttempt;
  });

  function reset() {
    checkouts.length = 0;
    abandons.length = 0;
    checkoutFails = false;
  }

  it("checks the branch out before abandoning it", async () => {
    reset();
    await abandonBranch("solve-strategy-2", "not selected", "/repo");
    assert.deepEqual(checkouts, ["solve-strategy-2"]);
    assert.deepEqual(abandons, ["not selected"]);
  });

  it("abandons nothing when the branch cannot be checked out", async () => {
    reset();
    checkoutFails = true;
    await abandonBranch("missing", "not selected", "/repo");
    assert.deepEqual(abandons, []);
  });

  it("names the lineage and its status in the reason", async () => {
    reset();
    const attempt = {
      branch: "solve-strategy-1",
      diagnostic: {
        lineage_id: "strategy-1",
        final_status: "stuck",
        repair_attempts: 3,
      },
    };
    await discardAttempt(attempt, { spec: { cwd: "/repo" } });

    assert.deepEqual(checkouts, ["solve-strategy-1"]);
    assert.equal(abandons.length, 1);
    assert.match(abandons[0], /strategy-1/);
    assert.match(abandons[0], /stuck/);
    assert.match(abandons[0], /3/);
  });
});

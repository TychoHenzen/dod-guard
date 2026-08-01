import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ATTEMPTS,
  buildLedger,
  mergeLedger,
  nextTarget,
  recordResult,
  summarize,
} from "./ledger.mjs";

const ranked = (file, score) => ({
  file,
  score,
  rules: { complexity: 2 },
  churn: { returns: 3, fixReturns: 1 },
  hasOracle: true,
});

describe("buildLedger", () => {
  it("marks every entry pending with no attempts", () => {
    const [entry] = buildLedger([ranked("a.ts", 9)]).entries;
    assert.equal(entry.status, "pending");
    assert.equal(entry.attempts, 0);
  });

  it("keeps the ranked order it was given", () => {
    const ledger = buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]);
    assert.deepEqual(
      ledger.entries.map((entry) => entry.file),
      ["a.ts", "b.ts"],
    );
  });

  it("records the tangle score as the before measurement", () => {
    const [entry] = buildLedger([ranked("a.ts", 9)]).entries;
    assert.equal(entry.before.score, 9);
  });
});

describe("mergeLedger", () => {
  it("keeps the status of a file it already tried", () => {
    const old = recordResult(buildLedger([ranked("a.ts", 9)]), "a.ts", {
      status: "resistant",
      reason: "two failed cycles",
    });
    const merged = mergeLedger(old, [ranked("a.ts", 9)]);
    assert.equal(merged.entries[0].status, "resistant");
  });

  it("carries the attempt count across a reseed", () => {
    const old = recordResult(buildLedger([ranked("a.ts", 9)]), "a.ts", {
      status: "pending",
    });
    const merged = mergeLedger(old, [ranked("a.ts", 9)]);
    assert.equal(merged.entries[0].attempts, 1);
  });

  it("refreshes the score of a known file", () => {
    const old = buildLedger([ranked("a.ts", 9)]);
    const merged = mergeLedger(old, [ranked("a.ts", 2)]);
    assert.equal(merged.entries[0].score, 2);
  });

  it("adds a file the old ledger never saw", () => {
    const merged = mergeLedger(buildLedger([ranked("a.ts", 9)]), [
      ranked("a.ts", 9),
      ranked("b.ts", 5),
    ]);
    assert.equal(merged.entries.length, 2);
  });

  it("drops a file that no longer scores", () => {
    const merged = mergeLedger(buildLedger([ranked("a.ts", 9)]), []);
    assert.deepEqual(merged.entries, []);
  });
});

describe("nextTarget", () => {
  it("returns the highest scoring pending entry", () => {
    const ledger = buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]);
    assert.equal(nextTarget(ledger).file, "a.ts");
  });

  it("skips an accepted entry", () => {
    const ledger = recordResult(
      buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]),
      "a.ts",
      { status: "accepted" },
    );
    assert.equal(nextTarget(ledger).file, "b.ts");
  });

  it("skips an entry that used up its attempts", () => {
    let ledger = buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      ledger = recordResult(ledger, "a.ts", { status: "pending" });
    }
    assert.equal(nextTarget(ledger).file, "b.ts");
  });

  it("returns null when nothing is left", () => {
    const ledger = recordResult(buildLedger([ranked("a.ts", 9)]), "a.ts", {
      status: "accepted",
    });
    assert.equal(nextTarget(ledger), null);
  });
});

describe("recordResult", () => {
  it("raises the attempt count", () => {
    const ledger = recordResult(buildLedger([ranked("a.ts", 9)]), "a.ts", {
      status: "pending",
    });
    assert.equal(ledger.entries[0].attempts, 1);
  });

  it("stores the after score and the commit", () => {
    const ledger = recordResult(buildLedger([ranked("a.ts", 9)]), "a.ts", {
      status: "accepted",
      after: { score: 2 },
      commit: "abc123",
    });
    assert.equal(ledger.entries[0].after.score, 2);
    assert.equal(ledger.entries[0].commit, "abc123");
  });

  it("does not change the entry it was not given", () => {
    const ledger = recordResult(
      buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]),
      "a.ts",
      { status: "accepted" },
    );
    assert.equal(ledger.entries[1].status, "pending");
  });

  it("throws on a file the ledger does not hold", () => {
    assert.throws(
      () => recordResult(buildLedger([ranked("a.ts", 9)]), "zz.ts", {}),
      /zz\.ts/,
    );
  });
});

describe("summarize", () => {
  it("counts entries by status", () => {
    const ledger = recordResult(
      buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]),
      "a.ts",
      { status: "accepted" },
    );
    assert.deepEqual(summarize(ledger), {
      pending: 1,
      accepted: 1,
      resistant: 0,
      skipped: 0,
    });
  });
});

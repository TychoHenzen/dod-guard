import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { changeIdForFile } from "./change-id.mjs";
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

// nextTarget checks whether an accepted entry's change is still open on
// disk, so most cases need a root with no openspec/changes/ at all.
function emptyRoot() {
  return mkdtempSync(join(tmpdir(), "ledger-"));
}

function openChangeRoot(file) {
  const root = emptyRoot();
  mkdirSync(join(root, "openspec", "changes", changeIdForFile(file)), { recursive: true });
  return root;
}

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
    assert.equal(nextTarget(ledger, emptyRoot()).file, "a.ts");
  });

  it("skips an accepted entry whose change already archived", () => {
    const ledger = recordResult(
      buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]),
      "a.ts",
      { status: "accepted" },
    );
    assert.equal(nextTarget(ledger, emptyRoot()).file, "b.ts");
  });

  it("resumes an accepted entry whose change is still open", () => {
    const ledger = recordResult(
      buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]),
      "a.ts",
      { status: "accepted" },
    );
    assert.equal(nextTarget(ledger, openChangeRoot("a.ts")).file, "a.ts");
  });

  it("never returns a resistant entry, even with its change still open", () => {
    const ledger = recordResult(
      buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]),
      "a.ts",
      { status: "resistant", reason: "two failed cycles" },
    );
    assert.equal(nextTarget(ledger, openChangeRoot("a.ts")).file, "b.ts");
  });

  it("skips an entry that used up its attempts", () => {
    let ledger = buildLedger([ranked("a.ts", 9), ranked("b.ts", 4)]);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      ledger = recordResult(ledger, "a.ts", { status: "pending" });
    }
    assert.equal(nextTarget(ledger, emptyRoot()).file, "b.ts");
  });

  it("returns null when nothing is left", () => {
    const ledger = recordResult(buildLedger([ranked("a.ts", 9)]), "a.ts", {
      status: "accepted",
    });
    assert.equal(nextTarget(ledger, emptyRoot()), null);
  });
});

describe("changeIdForFile", () => {
  it("slugs the file path under a tighten- prefix", () => {
    assert.equal(changeIdForFile("src/foo/Bar.ts"), "tighten-src-foo-bar");
  });

  it("strips the extension and collapses separators", () => {
    assert.equal(changeIdForFile("a/b_c.d.test.ts"), "tighten-a-b-c-d-test");
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
    });
  });
});

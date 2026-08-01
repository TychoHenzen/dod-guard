import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PICK = fileURLToPath(new URL("./pick-target.mjs", import.meta.url));
const RECORD = fileURLToPath(new URL("./record-result.mjs", import.meta.url));

function entry(file, score) {
  return {
    file,
    score,
    rules: { complexity: 3 },
    churn: { touches: 4, fixes: 2 },
    hasOracle: true,
    status: "pending",
    attempts: 0,
    before: { score },
    after: null,
    commit: null,
    reason: null,
  };
}

function makeLedger(...entries) {
  const dir = mkdtempSync(join(tmpdir(), "pick-"));
  mkdirSync(join(dir, ".tighten"));
  writeFileSync(
    join(dir, ".tighten", "ledger.json"),
    JSON.stringify({ version: 1, entries }, null, 2),
  );
  return dir;
}

function readLedger(dir) {
  return JSON.parse(readFileSync(join(dir, ".tighten", "ledger.json"), "utf8"));
}

const run = (script, dir, args) =>
  spawnSync(process.execPath, [script, `--root=${dir}`, ...args], {
    encoding: "utf8",
  });

describe("pick-target CLI", () => {
  it("exits 3 when no ledger exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "pick-"));
    const result = run(PICK, dir, []);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Run seed-ledger\.mjs first/);
  });

  it("prints the top pending target and exits 0", () => {
    const dir = makeLedger(entry("src/a.ts", 90), entry("src/b.ts", 10));
    const result = run(PICK, dir, []);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /file: src\/a\.ts/);
    assert.match(result.stdout, /attempt: 1 of 2/);
  });

  it("says which oracle the target has", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    assert.match(run(PICK, dir, []).stdout, /oracle: existing tests/);
  });

  it("exits 4 when every target is finished", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    run(RECORD, dir, ["--file=src/a.ts", "--status=accepted"]);
    const result = run(PICK, dir, []);
    assert.equal(result.status, 4);
    assert.match(result.stdout, /queue empty. accepted: 1/);
  });

  it("emits the raw entry under --json", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    const parsed = JSON.parse(run(PICK, dir, ["--json"]).stdout);
    assert.equal(parsed.file, "src/a.ts");
    assert.equal(parsed.status, "pending");
  });
});

describe("record-result CLI", () => {
  it("exits 3 on an unknown status", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    const result = run(RECORD, dir, ["--file=src/a.ts", "--status=maybe"]);
    assert.equal(result.status, 3);
  });

  it("demands a reason before it marks a target resistant", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    const result = run(RECORD, dir, ["--file=src/a.ts", "--status=resistant"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /--reason is required/);
  });

  it("exits 3 on a file the ledger does not hold", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    const result = run(RECORD, dir, ["--file=src/zz.ts", "--status=accepted"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /no entry for src\/zz\.ts/);
  });

  it("stores the commit and the measured score", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    const args = [
      "--file=src/a.ts",
      "--status=accepted",
      "--commit=abc123",
      "--after=12",
    ];
    assert.equal(run(RECORD, dir, args).status, 0);
    const [saved] = readLedger(dir).entries;
    assert.equal(saved.commit, "abc123");
    assert.equal(saved.after.score, 12);
    assert.equal(saved.attempts, 1);
  });

  // A failed cycle that stays pending must still burn an attempt, or the loop
  // picks the same target forever.
  it("counts a failed cycle that leaves the target pending", () => {
    const dir = makeLedger(entry("src/a.ts", 90));
    run(RECORD, dir, ["--file=src/a.ts", "--status=pending"]);
    assert.equal(readLedger(dir).entries[0].attempts, 1);
    assert.match(run(PICK, dir, []).stdout, /attempt: 2 of 2/);
    run(RECORD, dir, ["--file=src/a.ts", "--status=pending"]);
    assert.equal(run(PICK, dir, []).status, 4);
  });
});

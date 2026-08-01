import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SEED = fileURLToPath(new URL("./seed-ledger.mjs", import.meta.url));

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
}

function commit(dir, subject, file, body) {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, file), body);
  git(dir, "add", "-A");
  git(dir, "commit", "-m", subject);
}

// A repository where one file was patched twice and another was written once.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "tighten-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "Test");
  commit(dir, "feat: add router", "src/router.ts", "one\n");
  commit(dir, "fix: trailing slash", "src/router.ts", "two\n");
  commit(dir, "fix: empty path", "src/router.ts", "three\n");
  commit(dir, "feat: add store", "src/store.ts", "one\n");
  writeFileSync(join(dir, "src", "router.test.ts"), "test\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "test: router");
  return dir;
}

const UNITS = {
  units: [
    { file: "src/router.ts", rules: { complexity: 3 } },
    { file: "src/store.ts", rules: { complexity: 3 } },
    { file: "src/quiet.ts", rules: { "line-length": 40 } },
  ],
};

function seed(dir, extra = []) {
  const unitsPath = join(dir, "units.json");
  writeFileSync(unitsPath, JSON.stringify(UNITS));
  return spawnSync(
    process.execPath,
    [SEED, `--units=${unitsPath}`, `--root=${dir}`, ...extra],
    { encoding: "utf8" },
  );
}

function readLedger(dir) {
  return JSON.parse(readFileSync(join(dir, ".tighten", "ledger.json"), "utf8"));
}

describe("seed-ledger CLI", () => {
  it("exits 3 and prints usage when --units is missing", () => {
    const result = spawnSync(process.execPath, [SEED], { encoding: "utf8" });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: node seed-ledger\.mjs/);
  });

  it("ranks the fix-churned file above the quiet one", () => {
    const dir = makeRepo();
    assert.equal(seed(dir).status, 0);
    const ledger = readLedger(dir);
    assert.deepEqual(
      ledger.entries.map((entry) => entry.file),
      ["src/router.ts", "src/store.ts"],
    );
  });

  it("drops a file whose only violations are formatting", () => {
    const dir = makeRepo();
    seed(dir);
    const files = readLedger(dir).entries.map((entry) => entry.file);
    assert.ok(!files.includes("src/quiet.ts"));
  });

  it("records the churn it measured from git", () => {
    const dir = makeRepo();
    seed(dir);
    const [router] = readLedger(dir).entries;
    assert.deepEqual(router.churn, { touches: 3, fixes: 2 });
  });

  it("marks a file with a sibling test as having an oracle", () => {
    const dir = makeRepo();
    seed(dir);
    const entries = readLedger(dir).entries;
    const byFile = Object.fromEntries(entries.map((e) => [e.file, e]));
    assert.equal(byFile["src/router.ts"].hasOracle, true);
    assert.equal(byFile["src/store.ts"].hasOracle, false);
  });

  it("starts every entry pending", () => {
    const dir = makeRepo();
    seed(dir);
    const statuses = readLedger(dir).entries.map((entry) => entry.status);
    assert.deepEqual(statuses, ["pending", "pending"]);
  });

  it("keeps recorded history when it reseeds", () => {
    const dir = makeRepo();
    seed(dir);
    const ledger = readLedger(dir);
    ledger.entries[0].status = "resistant";
    ledger.entries[0].attempts = 2;
    writeFileSync(
      join(dir, ".tighten", "ledger.json"),
      JSON.stringify(ledger, null, 2),
    );
    seed(dir);
    const [router] = readLedger(dir).entries;
    assert.equal(router.status, "resistant");
    assert.equal(router.attempts, 2);
  });

  it("reports the counts it wrote", () => {
    const dir = makeRepo();
    const result = seed(dir);
    assert.match(result.stdout, /targets: 2/);
    assert.match(result.stdout, /pending: 2 accepted: 0 resistant: 0/);
  });
});

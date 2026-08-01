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
  writeFileSync(join(dir, file), `${body}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-m", subject);
}

// A repository with one file the work kept returning to, one file built in a
// single burst of commits, and one file written once.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "tighten-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "Test");
  commit(dir, "feat: add router", "src/router.ts", "one");
  commit(dir, "test: router", "src/router.test.ts", "test");
  commit(dir, "feat: add burst", "src/burst.ts", "one");
  commit(dir, "fix: burst trailing slash", "src/burst.ts", "two");
  commit(dir, "fix: burst empty path", "src/burst.ts", "three");
  commit(dir, "feat: add wander", "src/wander.ts", "one");
  elsewhere(dir, 0);
  commit(dir, "fix: wander trailing slash", "src/wander.ts", "two");
  elsewhere(dir, 1);
  commit(dir, "fix: wander empty path", "src/wander.ts", "three");
  return dir;
}

// Six commits on other files. They put a gap between two visits to one file,
// which is what turns a second visit into a return.
function elsewhere(dir, round) {
  for (let i = 0; i < 6; i += 1) {
    commit(dir, `chore: other ${round}.${i}`, `src/other${round}${i}.ts`, "x");
  }
}

const UNITS = {
  units: [
    { file: "src/router.ts", rules: { complexity: 3 } },
    { file: "src/burst.ts", rules: { complexity: 3 } },
    { file: "src/wander.ts", rules: { complexity: 3 } },
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

function entriesByFile(dir) {
  return Object.fromEntries(
    readLedger(dir).entries.map((entry) => [entry.file, entry]),
  );
}

describe("seed-ledger CLI", () => {
  it("exits 3 and prints usage when --units is missing", () => {
    const result = spawnSync(process.execPath, [SEED], { encoding: "utf8" });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: node seed-ledger\.mjs/);
  });

  it("ranks the file the work returned to above a single burst", () => {
    const dir = makeRepo();
    assert.equal(seed(dir).status, 0);
    const ledger = readLedger(dir);
    assert.deepEqual(
      ledger.entries.map((entry) => entry.file),
      ["src/wander.ts", "src/router.ts", "src/burst.ts"],
    );
  });

  it("drops a file whose only violations are formatting", () => {
    const dir = makeRepo();
    seed(dir);
    const files = readLedger(dir).entries.map((entry) => entry.file);
    assert.ok(!files.includes("src/quiet.ts"));
  });

  it("records the returns it measured from git", () => {
    const dir = makeRepo();
    seed(dir);
    const byFile = entriesByFile(dir);
    assert.deepEqual(byFile["src/wander.ts"].churn, {
      returns: 2,
      fixReturns: 2,
    });
  });

  it("scores three commits in a row as no churn", () => {
    const dir = makeRepo();
    seed(dir);
    assert.deepEqual(entriesByFile(dir)["src/burst.ts"].churn, {
      returns: 0,
      fixReturns: 0,
    });
  });

  it("marks a file with a sibling test as having an oracle", () => {
    const dir = makeRepo();
    seed(dir);
    const byFile = entriesByFile(dir);
    assert.equal(byFile["src/router.ts"].hasOracle, true);
    assert.equal(byFile["src/burst.ts"].hasOracle, false);
  });

  it("starts every entry pending", () => {
    const dir = makeRepo();
    seed(dir);
    const statuses = readLedger(dir).entries.map((entry) => entry.status);
    assert.deepEqual(statuses, ["pending", "pending", "pending"]);
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
    const [wander] = readLedger(dir).entries;
    assert.equal(wander.status, "resistant");
    assert.equal(wander.attempts, 2);
  });

  it("reports the counts it wrote", () => {
    const dir = makeRepo();
    const result = seed(dir);
    assert.match(result.stdout, /targets: 3/);
    assert.match(result.stdout, /pending: 3 accepted: 0 resistant: 0/);
  });
});

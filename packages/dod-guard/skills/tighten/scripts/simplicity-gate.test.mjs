import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const GATE = fileURLToPath(new URL("./simplicity-gate.mjs", import.meta.url));

function scan(dir, name, units) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ units }));
  return path;
}

function unit(file, complexity, errorRules = {}) {
  const items = Object.entries(errorRules).flatMap(([rule, count]) =>
    Array.from({ length: count }, () => ({ rule, severity: "error" })),
  );
  return { file, rules: { complexity }, items };
}

function gate(beforeUnits, afterUnits, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "simplicity-"));
  const before = scan(dir, "before.json", beforeUnits);
  const after = scan(dir, "after.json", afterUnits);
  return spawnSync(
    process.execPath,
    [GATE, `--before=${before}`, `--after=${after}`, ...extra],
    { encoding: "utf8" },
  );
}

describe("simplicity-gate CLI", () => {
  it("exits 3 and prints usage when a scan is missing", () => {
    const result = spawnSync(process.execPath, [GATE], { encoding: "utf8" });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: node simplicity-gate\.mjs/);
  });

  it("exits 0 when the rewrite lowered the tangle score", () => {
    const result = gate([unit("a.ts", 10)], [unit("a.ts", 3)]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /verdict: simpler/);
    assert.match(result.stdout, /gain: 70\.0%/);
  });

  it("exits 1 when the rewrite is a different tangle of the same size", () => {
    const result = gate([unit("a.ts", 10)], [unit("a.ts", 10)]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: not-simpler/);
  });

  it("exits 1 and names the rule when a hard violation count climbs", () => {
    const result = gate(
      [unit("a.ts", 10, { complexity: 1 })],
      [unit("a.ts", 2, { "nesting-depth": 3 })],
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /regression: nesting-depth 0 -> 3/);
    assert.match(result.stdout, /verdict: regressed/);
  });

  it("counts a split into several files as one result", () => {
    const after = [unit("a.ts", 2), unit("b.ts", 2)];
    const result = gate([unit("a.ts", 10)], after);
    assert.equal(result.status, 0);
  });

  it("exits 1 when the second scan found nothing to measure", () => {
    const result = gate([unit("a.ts", 10)], []);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: empty/);
  });

  it("holds the rewrite to --min-gain", () => {
    const args = ["--min-gain=0.5"];
    assert.equal(gate([unit("a.ts", 10)], [unit("a.ts", 9)], args).status, 1);
    assert.equal(gate([unit("a.ts", 10)], [unit("a.ts", 4)], args).status, 0);
  });

  it("emits machine-readable output under --json", () => {
    const result = gate([unit("a.ts", 10)], [unit("a.ts", 5)], ["--json"]);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, "simpler");
    assert.equal(parsed.gain, 0.5);
  });
});

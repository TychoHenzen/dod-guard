import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCAN = fileURLToPath(new URL("./overlap-scan.mjs", import.meta.url));

const ORIGINAL = [
  "export function summarize(orders, rates) {",
  "  const totals = new Map();",
  "  for (const order of orders) {",
  "    const rate = rates[order.currency] ?? 1;",
  "    const value = order.price * order.count * rate;",
  "    const seen = totals.get(order.region) ?? 0;",
  "    totals.set(order.region, seen + value);",
  "  }",
  "  const rows = [];",
  "  for (const [region, total] of totals) {",
  "    rows.push({ region, total, share: 0 });",
  "  }",
  "  const grand = rows.reduce((left, row) => left + row.total, 0);",
  "  for (const row of rows) {",
  "    row.share = grand === 0 ? 0 : row.total / grand;",
  "  }",
  "  return rows.sort((left, right) => right.total - left.total);",
  "}",
].join("\n");

function run(args) {
  return spawnSync(process.execPath, [SCAN, ...args], { encoding: "utf8" });
}

function writeCase(original, rewrite) {
  const dir = mkdtempSync(join(tmpdir(), "overlap-"));
  const left = join(dir, "original.js");
  const right = join(dir, "rewrite.js");
  writeFileSync(left, original);
  writeFileSync(right, rewrite);
  return [`--original=${left}`, `--rewrite=${right}`];
}

describe("overlap-scan CLI", () => {
  it("exits 3 and prints usage when arguments are missing", () => {
    const result = run([]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: node overlap-scan\.mjs/);
  });

  it("exits 1 when the rewrite is a renamed copy", () => {
    const once = ORIGINAL.replace(/totals/g, "byRegion");
    const renamed = once.replace(/rows/g, "out");
    const result = run(writeCase(ORIGINAL, renamed));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: cosmetic/);
    assert.match(result.stdout, /ngram: 0\.\d+ .*BREACH/);
    assert.match(result.stdout, /run: \d+ \(limit 60/);
  });

  it("exits 0 when the rewrite is structurally different", () => {
    const rewrite = [
      "export function summarize(orders, rates) {",
      "  const valued = orders.map((entry) => ({",
      "    region: entry.region,",
      "    amount: entry.price * entry.count * (rates[entry.currency] ?? 1),",
      "  }));",
      "  const grand = valued.reduce((sum, entry) => sum + entry.amount, 0);",
      "  const grouped = Object.groupBy(valued, (entry) => entry.region);",
      "  return Object.entries(grouped)",
      "    .map(([region, entries]) => {",
      "      const total = entries.reduce((sum, one) => sum + one.amount, 0);",
      "      return { region, total, share: grand === 0 ? 0 : total / grand };",
      "    })",
      "    .sort((left, right) => right.total - left.total);",
      "}",
    ].join("\n");
    const result = run(writeCase(ORIGINAL, rewrite));
    assert.equal(result.status, 0);
    assert.match(result.stdout, /verdict: rewritten/);
  });

  it("emits machine-readable output under --json", () => {
    const args = writeCase(ORIGINAL, ORIGINAL);
    const result = run([...args, "--json"]);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, "cosmetic");
    assert.equal(parsed.metrics.lines, 1);
    assert.ok(parsed.breached.includes("run"));
  });
});

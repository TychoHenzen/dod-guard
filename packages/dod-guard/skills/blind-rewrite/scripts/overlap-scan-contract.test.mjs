// CLI coverage for --contract-file. Text a contract requires byte for byte
// must not count as evidence of copying. The flag must also not be usable to
// launder an actual copy.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCAN = fileURLToPath(new URL("./overlap-scan.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [SCAN, ...args], { encoding: "utf8" });
}

function writeCase(original, rewrite) {
  const dir = mkdtempSync(join(tmpdir(), "overlap-contract-"));
  const left = join(dir, "original.js");
  const right = join(dir, "rewrite.js");
  writeFileSync(left, original);
  writeFileSync(right, rewrite);
  return [`--original=${left}`, `--rewrite=${right}`];
}

function writeContractFile(lines) {
  const dir = mkdtempSync(join(tmpdir(), "overlap-contract-"));
  const path = join(dir, "contract.txt");
  writeFileSync(path, lines.join("\n"));
  return path;
}

describe("overlap-scan --contract-file", () => {
  it("exits 3 when the contract file does not exist", () => {
    const args = writeCase("a", "a");
    const missing = join(mkdtempSync(join(tmpdir(), "overlap-")), "gone.txt");
    const result = run([...args, `--contract-file=${missing}`]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Cannot read contract file/);
  });

  it("ignores blank and #-comment lines", () => {
    // 65 unique tokens: over the run limit (60) if left in as shared text.
    const contract = Array.from({ length: 65 }, (_, i) => `word${i}`).join(" ");
    const original = `${contract}\nzzz1 zzz2 zzz3 zzz4`;
    const rewrite = `${contract}\nyyy1 yyy2 yyy3 yyy4`;
    const args = writeCase(original, rewrite);

    const withoutContract = run(args);
    assert.match(withoutContract.stdout, /run: 65 .*BREACH/);

    const lines = ["# registration surface", "", contract];
    const contractFile = writeContractFile(lines);
    const withContract = run([...args, `--contract-file=${contractFile}`]);
    assert.match(withContract.stdout, /run: 0 \(limit 60/);
    assert.match(withContract.stdout, /verdict: rewritten/);
  });

  it("removes the longer of two overlapping contract strings first", () => {
    const shortContract = "Create a new DoD document";
    const longContract = `${shortContract} with recursive TaskNode tree.`;
    const original = `${longContract}\nalpha1 alpha2 alpha3 alpha4`;
    const rewrite = `${longContract}\nbeta1 beta2 beta3 beta4`;
    const args = writeCase(original, rewrite);
    const contractFile = writeContractFile([shortContract, longContract]);

    const result = run([...args, `--contract-file=${contractFile}`]);
    assert.match(result.stdout, /run: 0 \(limit 60/);
  });
});

// A required boilerplate block spans several lines, so the one-per-line form
// cannot carry it. The JSON array form can.
describe("overlap-scan --contract-file, JSON array form", () => {
  const guard = [
    "const _filename = fileURLToPath(import.meta.url);",
    "async function main() {",
    "  const transport = new StdioServerTransport();",
    "  await server.connect(transport);",
    "}",
    "if (process.argv[1] === _filename) {",
    "  main().catch((err) => {",
    "    process.stderr.write(`server failed: ${err}`);",
    "    process.exit(1);",
    "  });",
    "}",
  ].join("\n");

  // Two implementations of the same job that share no phrasing.
  const left = [
    "function totalise(rows) {",
    "  let sum = 0;",
    "  for (const row of rows) sum += row.amount;",
    "  return sum;",
    "}",
  ].join("\n");
  const right = [
    "const aggregate = (records) =>",
    "  records.reduce((carried, item) => carried + item.value, 0);",
  ].join("\n");

  function writeJsonContract(entries) {
    const dir = mkdtempSync(join(tmpdir(), "overlap-contract-"));
    const path = join(dir, "contract.json");
    writeFileSync(path, JSON.stringify(entries, null, 2));
    return path;
  }

  function metricsOf(args) {
    return JSON.parse(run([...args, "--json"]).stdout).metrics;
  }

  it("removes a multi-line contract block from both sides", () => {
    const args = writeCase(`${guard}\n${left}\n`, `${guard}\n${right}\n`);
    const before = metricsOf(args);
    const after = metricsOf([...args, `--contract-file=${writeJsonContract([guard])}`]);
    // The guard block is 30 tokens of the shared run. Only incidental single
    // tokens survive its removal.
    assert.ok(before.run > 20, `the block should dominate the run, saw ${before.run}`);
    assert.ok(after.run < 5, `the block should be gone from the run, saw ${after.run}`);
  });

  it("still calls a copy cosmetic when only the contract block is exempt", () => {
    const copied = `${guard}\n${left}\n${left.replace(/totalise/g, "totalTwo")}\n`;
    const args = writeCase(copied, copied);
    const result = run([...args, `--contract-file=${writeJsonContract([guard])}`]);
    assert.equal(result.status, 1, "identical code outside the contract is still a copy");
  });

  it("rejects a JSON array holding something other than strings", () => {
    const args = writeCase("const a = 1;\n", "const b = 2;\n");
    const result = run([...args, `--contract-file=${writeJsonContract([42])}`]);
    assert.equal(result.status, 3);
  });
});

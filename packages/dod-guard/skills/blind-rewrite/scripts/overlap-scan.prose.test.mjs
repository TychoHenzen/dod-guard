// CLI coverage for --mode=prose. Same overlap-scan.mjs binary, routed to
// scoreProseOverlap instead of scoreOverlap. Thresholds are provisional
// (S04 replaces them), so these tests assert on verdicts and exit codes,
// never on the specific numbers in the report lines.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCAN = fileURLToPath(new URL("./overlap-scan.mjs", import.meta.url));

const PROSE_LEFT = [
  "The warehouse manager reorganized every shelf before the holiday rush began.",
  "Boxes of paperclips moved next to the stapler bins for faster picking.",
  "A new labeling system used color codes for each product category.",
  "Workers reported shorter walking routes after the second week of testing.",
  "The manager plans to review the layout again next quarter.",
].join(" ");

const PROSE_RIGHT = [
  "Arctic terns travel farther each year than almost any other migratory bird alive today.",
  "Scientists tracked several flocks using lightweight satellite tags attached before departure.",
  "The birds crossed three oceans and rested on remote islands along the way.",
  "Researchers found that younger terns took longer, less direct paths than experienced adults.",
  "The full migration data will be published later this year.",
].join(" ");

// A code-mode fixture: a renamed copy the code gate calls cosmetic.
const CODE_ORIGINAL = [
  "export function summarize(orders, rates) {",
  "  const totals = new Map();",
  "  for (const order of orders) {",
  "    const rate = rates[order.currency] ?? 1;",
  "    const value = order.price * order.count * rate;",
  "    totals.set(order.region, (totals.get(order.region) ?? 0) + value);",
  "  }",
  "  return totals;",
  "}",
].join("\n");

const CONTRACT_SENTENCE =
  "This project ships five plugins through a single npm workspace and every " +
  "proof runs against the host operating system before any predicate can be " +
  "marked complete for the team.";

function run(args) {
  return spawnSync(process.execPath, [SCAN, ...args], { encoding: "utf8" });
}

function writeCase(original, rewrite) {
  const dir = mkdtempSync(join(tmpdir(), "overlap-prose-"));
  const left = join(dir, "original.md");
  const right = join(dir, "rewrite.md");
  writeFileSync(left, original);
  writeFileSync(right, rewrite);
  return [`--original=${left}`, `--rewrite=${right}`];
}

function writeContractFile(lines) {
  const dir = mkdtempSync(join(tmpdir(), "overlap-prose-contract-"));
  const path = join(dir, "contract.txt");
  writeFileSync(path, lines.join("\n"));
  return path;
}

describe("overlap-scan CLI --mode=prose", () => {
  it("exits 0 for two unrelated prose files", () => {
    const result = run([...writeCase(PROSE_LEFT, PROSE_RIGHT), "--mode=prose"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /verdict: rewritten/);
  });

  it("exits 1 when a prose file is scored against itself", () => {
    const result = run([...writeCase(PROSE_LEFT, PROSE_LEFT), "--mode=prose"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: cosmetic/);
  });

  it("exits 3 for an unknown mode", () => {
    const result = run([...writeCase(PROSE_LEFT, PROSE_RIGHT), "--mode=bogus"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: node overlap-scan\.mjs/);
  });

  it("runs the code metrics when --mode is omitted", () => {
    const renamed = CODE_ORIGINAL.replace(/totals/g, "byRegion");
    const result = run(writeCase(CODE_ORIGINAL, renamed));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: cosmetic/);
  });

  it("emits the four prose metric keys under --json", () => {
    const args = [...writeCase(PROSE_LEFT, PROSE_LEFT), "--mode=prose", "--json"];
    const parsed = JSON.parse(run(args).stdout);
    assert.deepEqual(Object.keys(parsed.metrics).sort(), [
      "ngram",
      "order",
      "run",
      "sentences",
    ]);
  });

  it("does not call a copy cosmetic for a shared required passage alone", () => {
    const original = `${CONTRACT_SENTENCE} ${PROSE_LEFT}`;
    const rewrite = `${CONTRACT_SENTENCE} ${PROSE_RIGHT}`;
    const args = writeCase(original, rewrite);

    const withoutContract = run([...args, "--mode=prose"]);
    assert.equal(withoutContract.status, 1, "the shared passage alone breaches run");

    const contractFile = writeContractFile([CONTRACT_SENTENCE]);
    const withContract = run([...args, "--mode=prose", `--contract-file=${contractFile}`]);
    assert.equal(withContract.status, 0);
    assert.match(withContract.stdout, /verdict: rewritten/);
  });
});

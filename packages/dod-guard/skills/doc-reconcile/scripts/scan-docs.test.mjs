import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCAN = fileURLToPath(new URL("./scan-docs.mjs", import.meta.url));

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCAN, ...args], { cwd: cwd ?? process.cwd(), encoding: "utf8" });
}

let repo;

describe("scan-docs CLI", () => {
  before(() => {
    // A fixture with a genuine conflicting pair: two files both make a claim
    // under a "Setup" heading about the default port, with different numbers.
    // Each file also has one unrelated sentence. The plugin manifest carries
    // a description that shares one word ("widgets") with a.md's sentence.
    repo = mkdtempSync(join(tmpdir(), "scan-docs-"));
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "t@example.com");
    git(repo, "config", "user.name", "Test");
    writeFileSync(
      join(repo, "a.md"),
      [
        "# Setup",
        "",
        "The default port is 8080.",
        "",
        "Some unrelated sentence about widgets and gadgets.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(repo, "b.md"),
      [
        "# Setup",
        "",
        "The default port is 9090.",
        "",
        "Another unrelated sentence about elephants and rivers.",
        "",
      ].join("\n"),
    );
    mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(repo, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "test-plugin", description: "A plugin for testing widgets." }, null, 2),
    );
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "seed fixture");
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("reports the JSON shape and correct counts", () => {
    const result = run(["--root=" + repo, "--json", "--min-tokens=0"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.generatedAt, "string");
    assert.equal(parsed.root, repo);
    assert.equal(parsed.docCount, 3);
    assert.equal(parsed.claimCount, 5);
    assert.equal(parsed.pairCount, 3);
    assert.equal(parsed.pairs.length, 3);
    assert.deepEqual(parsed.options, { threshold: 0.35, maxPerClaim: 3, minTokens: 0, limit: null });
  });

  it("includes the known conflicting port claim pair with a perfect score", () => {
    const result = run(["--root=" + repo, "--json", "--min-tokens=0"]);
    const parsed = JSON.parse(result.stdout);
    const portPair = parsed.pairs.find((p) => p.a.text.includes("8080") || p.b.text.includes("8080"));
    assert.ok(portPair, "expected a pair involving the 8080 claim");
    assert.equal(portPair.a.text, "The default port is 8080.");
    assert.equal(portPair.b.text, "The default port is 9090.");
    assert.equal(portPair.a.file, "a.md");
    assert.equal(portPair.b.file, "b.md");
    assert.equal(portPair.score, 1);
  });

  it("--json prints to stdout and writes no file", () => {
    const result = run(["--root=" + repo, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(repo, ".doc-reconcile")));
  });

  it("--out writes the file and creates its directory", () => {
    const outDir = mkdtempSync(join(tmpdir(), "scan-docs-out-"));
    try {
      const result = run(["--root=" + repo, "--out=nested/dir/candidates.json", "--min-tokens=0"], outDir);
      assert.equal(result.status, 0, result.stderr);
      const outPath = join(repo, "nested", "dir", "candidates.json");
      assert.ok(existsSync(outPath));
      const parsed = JSON.parse(readFileSync(outPath, "utf8"));
      assert.equal(parsed.pairCount, 3);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(join(repo, "nested"), { recursive: true, force: true });
    }
  });

  it("--limit truncates to the top N pairs", () => {
    const result = run(["--root=" + repo, "--json", "--limit=1", "--min-tokens=0"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.pairCount, 1);
    assert.equal(parsed.pairs.length, 1);
    assert.equal(parsed.pairs[0].score, 1);
    assert.equal(parsed.pairs[0].a.text, "The default port is 8080.");
  });

  it("produces identical output across two runs, aside from the timestamp", () => {
    // generatedAt is a wall-clock stamp. It legitimately differs between two
    // separate process runs. Everything the algorithm computes must not.
    const first = JSON.parse(run(["--root=" + repo, "--json"]).stdout);
    const second = JSON.parse(run(["--root=" + repo, "--json"]).stdout);
    delete first.generatedAt;
    delete second.generatedAt;
    assert.deepEqual(first, second);
  });

  it("exits 3 with a usage error on an unknown flag", () => {
    const result = run(["--root=" + repo, "--bogus=1"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /unknown option: --bogus=1/);
  });

  it("exits 3 with a usage error when --root is not a directory", () => {
    const result = run(["--root=" + join(repo, "does-not-exist")]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /--root is not a directory/);
  });

  it("exits 3 with a usage error on a non-numeric --threshold", () => {
    const result = run(["--root=" + repo, "--threshold=abc"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /--threshold must be a number/);
  });
});

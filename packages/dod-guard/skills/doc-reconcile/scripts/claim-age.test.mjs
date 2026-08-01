import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./claim-age.mjs", import.meta.url));

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
  return result.stdout;
}

function commit(cwd, message, when) {
  git(cwd, "add", "-A");
  const env = { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
  const result = spawnSync("git", ["commit", "-q", "-m", message], { cwd, encoding: "utf8", env });
  assert.equal(result.status, 0, `git commit: ${result.stderr}`);
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: cwd ?? process.cwd(), encoding: "utf8" });
}

let repo;

describe("claim-age CLI", () => {
  before(() => {
    // Story: commit A writes docs/a.md with a claim (port 8080).
    // Commit B writes docs/b.md with the contradicting claim (port 9090).
    // It lands two days later.
    // Commit C reformats the line in docs/a.md, rewrap only.
    // It lands three days after that.
    // a.md's claim must still date to commit A.
    // Commit C never changed its meaning. That is the whole point of the skill.
    repo = mkdtempSync(join(tmpdir(), "claim-age-"));
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "t@example.com");
    git(repo, "config", "user.name", "Test");

    writeFileSync(join(repo, "a.md"), ["# Setup", "", "The default port is 8080:", ""].join("\n"));
    commit(repo, "add a.md claim", "2026-01-01T09:00:00+00:00");

    writeFileSync(join(repo, "b.md"), ["# Setup", "", "The default port is 9090.", ""].join("\n"));
    commit(repo, "add b.md claim", "2026-01-03T09:00:00+00:00");

    writeFileSync(join(repo, "a.md"), ["# Setup", "", "The default port is 8080.", ""].join("\n"));
    commit(repo, "reformat a.md punctuation", "2026-01-06T09:00:00+00:00");
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("single mode reports the deciding sha and lists the skipped cosmetic commit", () => {
    const result = run(["--file=a.md", "--lines=3-3"], repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Verdict: dated/);
    assert.match(result.stdout, /reformat a.md punctuation/);
    assert.match(result.stdout, /Deciding commit:/);
    assert.match(result.stdout, /add a.md claim/);
  });

  it("pair mode returns DECISIVE and names docs/a.md as the older side despite the later reformat", () => {
    const result = run(["--pair=a.md:3-3", "--pair=b.md:3-3"], repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Verdict: DECISIVE/);
    assert.match(result.stdout, /Older: a\.md:3-3/);
  });

  it("exit code 0 on DECISIVE", () => {
    const result = run(["--pair=a.md:3-3", "--pair=b.md:3-3"], repo);
    assert.equal(result.status, 0);
  });

  it("exit code 1 on AMBIGUOUS when the two dates are inside --min-gap", () => {
    const result = run(["--pair=a.md:3-3", "--pair=b.md:3-3", "--min-gap=10"], repo);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Verdict: AMBIGUOUS/);
    assert.match(result.stdout, /within --min-gap=10/);
  });

  it("exit code 1 when one side is uncommitted", () => {
    writeFileSync(join(repo, "a.md"), ["# Setup", "", "The default port is 8080, uncommitted.", ""].join("\n"));
    try {
      const result = run(["--pair=a.md:3-3", "--pair=b.md:3-3"], repo);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /Verdict: AMBIGUOUS/);
      assert.match(result.stdout, /verdict uncommitted/);
    } finally {
      git(repo, "checkout", "--", "a.md");
    }
  });

  it("exit code 3 on a malformed --pair", () => {
    const result = run(["--pair=a.md-nope", "--pair=b.md:3-3"], repo);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /malformed --pair/);
  });

  it("exit code 3 on one --pair instead of two", () => {
    const result = run(["--pair=a.md:3-3"], repo);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /--pair must be given exactly twice/);
  });

  it("--json emits parseable JSON carrying the same verdict, single mode", () => {
    const result = run(["--file=a.md", "--lines=3-3", "--json"], repo);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, "dated");
    assert.equal(parsed.file, "a.md");
    assert.equal(parsed.skipped.length, 1);
  });

  it("--json emits parseable JSON carrying the same verdict, pair mode", () => {
    const result = run(["--pair=a.md:3-3", "--pair=b.md:3-3", "--json"], repo);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, "DECISIVE");
    assert.equal(parsed.olderSide, "a");
  });

  it("--json pair mode carries sha, summary, skipped per side", () => {
    // Side a (a.md:3-3) dates to "add a.md claim" and skips the later
    // "reformat a.md punctuation" commit as cosmetic. Side b (b.md:3-3) has
    // no cosmetic commits in its own history, so its skipped list is empty.
    const result = run(["--pair=a.md:3-3", "--pair=b.md:3-3", "--json"], repo);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.a.sha, "string");
    assert.match(parsed.a.summary, /add a.md claim/);
    assert.equal(parsed.a.skipped.length, 1);
    assert.match(parsed.a.skipped[0].summary, /reformat a.md punctuation/);
    assert.equal(typeof parsed.b.sha, "string");
    assert.match(parsed.b.summary, /add b.md claim/);
    assert.deepEqual(parsed.b.skipped, []);
  });

  it("exits 3 with a usage error on an unknown flag", () => {
    const result = run(["--file=a.md", "--lines=3-3", "--bogus=1"], repo);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /unknown option: --bogus=1/);
  });

  it("exits 3 on a malformed --lines", () => {
    const result = run(["--file=a.md", "--lines=nope"], repo);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /malformed --lines/);
  });
});

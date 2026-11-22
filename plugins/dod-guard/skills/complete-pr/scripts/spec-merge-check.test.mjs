import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the tests build a git repository and start the check
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the tests write specs and bodies to disk
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: the repository lives in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: test paths are joined per platform
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { body904 } from "../../../lib/harness/issue-body-fixtures.mjs";

const SCRIPT = fileURLToPath(new URL("./spec-merge-check.mjs", import.meta.url));
const FIXTURE = new URL("../../../lib/fixtures/openspec-shaped-body.md", import.meta.url);
const fixtureBody = () => readFileSync(FIXTURE, "utf8");

let root;

function git(...args) {
  const result = spawnSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function spec(name, ...requirements) {
  const blocks = requirements.map(
    (requirement) =>
      `### Requirement: ${requirement}\nThe system SHALL do it.\n\n#### Scenario: Works\n- **WHEN** a\n- **THEN** b\n`,
  );
  return `# ${name} Specification\n\n## Purpose\nTest.\n\n## Requirements\n${blocks.join("\n")}`;
}

// Commits the given specs and returns the commit sha.
function commitSpecs(specs) {
  for (const [capability, text] of Object.entries(specs)) {
    mkdirSync(join(root, "openspec", "specs", capability), { recursive: true });
    writeFileSync(join(root, "openspec", "specs", capability, "spec.md"), text);
  }
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", "specs");
  return git("rev-parse", "HEAD");
}

function check(body, sha) {
  const bodyFile = join(root, "..", `${Date.now()}-${Math.random()}.md`);
  writeFileSync(bodyFile, body);
  const result = spawnSync(
    process.execPath,
    [SCRIPT, `--body-file=${bodyFile}`, `--head-sha=${sha}`, `--root=${root}`],
    {
      encoding: "utf8",
    },
  );
  rmSync(bodyFile, { force: true });
  return { status: result.status, stderr: result.stderr, out: result.stdout ? JSON.parse(result.stdout) : null };
}

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "spec-merge-check-")), "repo");
  mkdirSync(root);
  git("init", "-q");
});

afterEach(() => rmSync(join(root, ".."), { recursive: true, force: true }));

test("passes when every requirement of the body is in the spec at the head", () => {
  const sha = commitSpecs({
    "card-rules": spec("card-rules", "Hand size limit", "Refusal reason"),
    "hand-view": spec("hand-view", "Draw button state"),
  });
  const result = check(fixtureBody(), sha);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.out, { status: "ok", findings: [] });
});

test("stops with spec-merge-missing and names the id and path of a missing ADDED requirement", () => {
  const sha = commitSpecs({
    "card-rules": spec("card-rules", "Hand size limit"),
    "hand-view": spec("hand-view", "Draw button state"),
  });
  const result = check(fixtureBody(), sha);

  assert.equal(result.status, 1);
  assert.deepEqual(result.out, {
    status: "spec-merge-missing",
    findings: [
      {
        id: "R-2",
        operation: "ADDED",
        name: "Refusal reason",
        path: "openspec/specs/card-rules/spec.md",
        problem: "missing",
      },
    ],
  });
});

test("reports a REMOVED requirement that is still in the spec", () => {
  const sha = commitSpecs({ "card-rules": spec("card-rules", "Hand size limit", "Old draw rule") });
  const body = fixtureBody()
    .replace(
      /- R-2 \(ADDED[^\n]*\n/,
      "- R-2 (REMOVED, card-rules) Old draw rule: The game SHALL no longer allow a free draw.\n",
    )
    .replace(/- R-3 [^\n]*\n/, "")
    .replace("- [ ] AC-3 (R-3)", "- [ ] AC-3 (R-1)");
  const result = check(body, sha);

  assert.equal(result.status, 1);
  assert.deepEqual(result.out.findings, [
    {
      id: "R-2",
      operation: "REMOVED",
      name: "Old draw rule",
      path: "openspec/specs/card-rules/spec.md",
      problem: "still-present",
    },
  ]);
});

test("reports skipped for a legacy body with no capability-tagged requirement", () => {
  const sha = commitSpecs({});
  const result = check(body904, sha);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.out.status, "skipped");
});

test("exits 2 for a head that is not a commit of the checkout", () => {
  commitSpecs({});
  const result = check(fixtureBody(), "f".repeat(40));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /is not a commit/);
});

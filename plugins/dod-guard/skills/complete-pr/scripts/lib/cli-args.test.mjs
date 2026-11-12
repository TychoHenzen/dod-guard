// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { parseArguments } from "./cli-args.mjs";

const HEAD = ["0123456789", "abcdef0123", "456789abcd", "ef01234567"].join("");
const BASE = ["owner/repo", "24"];
const REPO_DIR = "C:/work/repo";

test("parses normal completion with a pushed head", () => {
  assert.deepEqual(parseArguments([...BASE, "--pushed-head", HEAD]), {
    dryRun: false,
    pullNumber: 24,
    pushedHead: HEAD,
    recoverMerged: false,
    repoDir: null,
    repository: "owner/repo",
  });
});

test("accepts --repo-dir before or after the other flags", () => {
  const before = parseArguments([...BASE, "--repo-dir", REPO_DIR, "--pushed-head", HEAD]);
  const after = parseArguments([...BASE, "--pushed-head", HEAD, "--repo-dir", REPO_DIR]);

  assert.deepEqual(before, after);
  assert.equal(before.repoDir, REPO_DIR);
});

test("parses merged recovery with a dry run and a checkout", () => {
  const request = parseArguments([...BASE, "--recover-merged", "--dry-run", "--repo-dir", REPO_DIR]);

  assert.equal(request.recoverMerged, true);
  assert.equal(request.dryRun, true);
  assert.equal(request.pushedHead, null);
});

test("leaves the dry run off unless it is requested", () => {
  assert.equal(parseArguments([...BASE, "--recover-merged"]).dryRun, false);
});

const rejected = [
  ["a missing pushed head", [...BASE]],
  ["a malformed pushed head", [...BASE, "--pushed-head", "not-a-sha"]],
  ["a dry run without recovery", [...BASE, "--pushed-head", HEAD, "--dry-run"]],
  ["recovery with a pushed head", [...BASE, "--recover-merged", "--pushed-head", HEAD]],
  ["a --repo-dir with no value", [...BASE, "--pushed-head", HEAD, "--repo-dir"]],
  ["an unknown flag", [...BASE, "--pushed-head", HEAD, "--force"]],
  ["an inherited property name used as a flag", [...BASE, "--pushed-head", HEAD, "constructor"]],
  ["a zero pull request number", ["owner/repo", "0", "--pushed-head", HEAD]],
  ["no repository", ["", "24", "--pushed-head", HEAD]],
];

for (const [name, argv] of rejected) {
  test(`rejects ${name}`, () => {
    assert.equal(parseArguments(argv), null);
  });
}

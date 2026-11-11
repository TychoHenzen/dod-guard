// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { parseArguments } from "./cli-args.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const BASE = ["owner/repo", "24"];

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
  const before = parseArguments([...BASE, "--repo-dir", "C:/work/repo", "--pushed-head", HEAD]);
  const after = parseArguments([...BASE, "--pushed-head", HEAD, "--repo-dir", "C:/work/repo"]);

  assert.deepEqual(before, after);
  assert.equal(before.repoDir, "C:/work/repo");
});

test("parses merged recovery with an optional dry run and checkout", () => {
  const request = parseArguments([...BASE, "--recover-merged", "--dry-run", "--repo-dir", "C:/work/repo"]);

  assert.equal(request.recoverMerged, true);
  assert.equal(request.dryRun, true);
  assert.equal(request.pushedHead, null);
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

// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";

const HEAD_MOVED = /head moved from abc1234 to def5678; do not publish/;
const cli = fileURLToPath(new URL("./review-support.mjs", import.meta.url));
const checkHead = (reviewed, current) =>
  spawnSync(process.execPath, [cli, "check-head", "--reviewed", reviewed, "--current", current], { encoding: "utf8" });

test("publication proceeds only when the pull request head is the reviewed head", () => {
  const same = checkHead("abc1234", "abc1234");
  const moved = checkHead("abc1234", "def5678");

  assert.equal(same.status, 0);
  assert.deepEqual(JSON.parse(same.stdout), { headSha: "abc1234", unchanged: true });
  assert.notEqual(moved.status, 0);
  assert.match(moved.stderr, HEAD_MOVED);
});

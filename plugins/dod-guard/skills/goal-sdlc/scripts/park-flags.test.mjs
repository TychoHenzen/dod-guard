import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { usageProblem } from "./park-flags.mjs";

test("usageProblem names the first missing or malformed flag", () => {
  const flags = { action: "park", repository: "a/b", issue: "5", blocked: "x", "unblocks-when": "y" };
  assert.equal(usageProblem(flags), null);
  assert.equal(usageProblem(null), "arguments must be flags only");
  assert.equal(usageProblem({ ...flags, action: "hold" }), "--action must be park or unpark");
  assert.equal(usageProblem({ ...flags, repository: "ab" }), "--repository must be owner/name");
  assert.equal(usageProblem({ ...flags, issue: "0" }), "--issue must be a positive issue number");
  assert.equal(usageProblem({ ...flags, blocked: "two\nlines" }), "--blocked must be one nonblank line");
  assert.equal(usageProblem({ ...flags, "unblocks-when": undefined }), "--unblocks-when must be one nonblank line");
  assert.equal(usageProblem({ action: "unpark", repository: "a/b", issue: "5" }), null);
});

test("the command exits 2 with usage on bad arguments and never calls gh", () => {
  const script = fileURLToPath(new URL("./park.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--action=park", "--repository=a/b"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--issue must be a positive issue number/u);
  assert.match(result.stderr, /usage: park\.mjs/u);
});

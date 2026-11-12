// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtempSync, rmSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { dirname, join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test, { after } from "node:test";

const SCRIPT = join(import.meta.dirname, "complete-pr.mjs");
const HEAD = ["0123456789", "abcdef0123", "456789abcd", "ef01234567"].join("");
const NOT_A_CHECKOUT_PREFIX = /^complete-pr failed \[not_a_checkout\]/;
const FAILED_PREFIX = /^complete-pr failed/;
const GUARD_STOP = /\[(?:not_a_checkout|wrong_checkout)\]/;
const created = [];

after(() => {
  for (const directory of created) {
    rmSync(directory, { force: true, recursive: true });
  }
});

// A directory outside every repository, with git told not to search above it.
function emptyDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "complete-pr-"));
  created.push(directory);
  // biome-ignore lint/style/noProcessEnv: The child process inherits the parent environment plus one git variable.
  const env = { ...process.env, ...Object.fromEntries([["GIT_CEILING_DIRECTORIES", dirname(directory)]]) };
  return { directory, env };
}

function checkoutWithOrigin(origin) {
  const { directory, env } = emptyDirectory();
  spawnSync("git", ["init", "--quiet", directory], { encoding: "utf8" });
  spawnSync("git", ["-C", directory, "remote", "add", "origin", origin]);
  return { directory, env };
}

function runFrom(cwd, env, extraArgs) {
  const args = [SCRIPT, "owner/repo", "24", "--pushed-head", HEAD, ...extraArgs];
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8", env });
}

test("stops with not_a_checkout before any GitHub request when run outside a checkout", () => {
  const { directory, env } = emptyDirectory();

  const result = runFrom(directory, env, []);

  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).code, "not_a_checkout");
  assert.match(result.stderr, NOT_A_CHECKOUT_PREFIX);
});

test("--repo-dir selects the checkout the guard inspects instead of the working directory", () => {
  const { directory, env } = emptyDirectory();

  const result = runFrom(import.meta.dirname, env, ["--repo-dir", directory]);

  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).code, "not_a_checkout");
});

test("stops with wrong_checkout when origin names another repository", () => {
  const { directory, env } = checkoutWithOrigin("https://github.com/other/repo.git");

  const result = runFrom(directory, env, []);

  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).code, "wrong_checkout");
});

test("--repo-dir naming a matching checkout passes the guard from another working directory", () => {
  const { directory, env } = checkoutWithOrigin("https://github.com/owner/repo.git");
  // The unreachable proxy keeps the GitHub request that follows the guard off the network.
  const offline = {
    ...env,
    ...Object.fromEntries([
      ["GH_TOKEN", "placeholder"],
      ["HTTPS_PROXY", "http://127.0.0.1:9"],
      ["NO_PROXY", ""],
    ]),
  };

  const result = runFrom(import.meta.dirname, offline, ["--repo-dir", directory]);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, FAILED_PREFIX);
  assert.doesNotMatch(result.stderr, GUARD_STOP);
});

test("stops on a --repo-dir that does not exist", () => {
  const { directory, env } = emptyDirectory();

  const result = runFrom(directory, env, ["--repo-dir", join(directory, "missing")]);

  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).code, "ENOENT");
});

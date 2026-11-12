// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { requireRepositoryCheckout } from "./checkout-guard.mjs";

const DIRECTORY = "C:/plugin-cache";
const WRONG_REPOSITORY = /not Owner\/Repo/;
const NOT_A_CHECKOUT = /C:\/plugin-cache is not a git checkout/;
const REPO_DIR_HINT = /--repo-dir <that checkout>/;

function check(origin) {
  return () => requireRepositoryCheckout("Owner/Repo", { originUrl: () => origin }, DIRECTORY);
}

const accepted = [
  "https://github.com/owner/repo.git",
  "https://github.com/Owner/Repo",
  "git@github.com:owner/repo.git",
  "ssh://git@github.com/owner/repo.git",
  "https://x-access-token:token@github.com/owner/repo.git",
  "https://github.com/owner/repo/",
];

for (const origin of accepted) {
  test(`accepts the origin ${origin}`, () => {
    assert.doesNotThrow(check(origin));
  });
}

const wrong = [
  "https://github.com/owner/other.git",
  "https://github.com/owner/repo-fork.git",
  "https://github.com/other/owner/repo.git",
  "https://notgithub.com/owner/repo.git",
  "file:///srv/mirror",
];

for (const origin of wrong) {
  test(`stops on the origin ${origin}`, () => {
    assert.throws(check(origin), { code: "wrong_checkout", message: WRONG_REPOSITORY });
  });
}

test("never prints a credential embedded in the origin URL", () => {
  const credential = ["not", "a", "real", "credential"].join("-");
  const origin = `https://x-access-token:${credential}@github.com/owner/other.git`;

  assert.throws(check(origin), (error) => error.message.includes("owner/other") && !error.message.includes(credential));
});

test("stops with not_a_checkout and a recovery that names --repo-dir when no origin exists", () => {
  assert.throws(check(null), {
    code: "not_a_checkout",
    message: NOT_A_CHECKOUT,
    recovery: REPO_DIR_HINT,
  });
});

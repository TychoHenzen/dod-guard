import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./rules-comments-test-support.mjs";

test("a comment that only renames the declaration is flagged", () => {
  const found = scan(
    "rs",
    "/// The user name.\npub user_name: String,",
    "comment-restates-code",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "warn");
});

test("a comment that adds a reason is not flagged as restatement", () => {
  const code =
    "/// Clamped at 64 because the wire format spends one byte on the " +
    "length.\npub user_name: String,";
  assert.deepEqual(scan("rs", code, "comment-restates-code"), []);
});

test("an attribute does not hide a restatement", () => {
  const code =
    "/// The default backend.\n#[serde(default)]\n" +
    "pub default_backend: Option<String>,";
  assert.equal(scan("rs", code, "comment-restates-code").length, 1);
});

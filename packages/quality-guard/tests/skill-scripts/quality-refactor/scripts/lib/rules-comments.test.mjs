import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./rules-comments-test-support.mjs";

const NARRATED_FIELD = [
  "pub struct Settings {",
  "    /// Cap on the tokens one API reply may produce, clamped to " +
    "1024-65536.",
  "    ///",
  "    /// Defaults to 8192. The cap covers reasoning tokens as well as " +
    "the reply.",
  "    /// A thinking model spends part of the cap before it writes a " +
    "character.",
  "    /// It was hardcoded at 4096 during the first implementation.",
  "    /// A write call once ran past the cap mid-argument.",
  "    /// The API stopped early instead of returning a complete source file.",
  "    pub max_tokens: Option<u32>,",
  "}",
].join("\n");

test("a seven-line story over a one-line field is an error", () => {
  const found = scan("rs", NARRATED_FIELD, "comment-bloat");
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "error");
  assert.equal(found[0].metric, 7);
  assert.match(found[0].message, /7-line comment over 1 line/);
});

test("the ratio keeps a long comment over a long function quiet", () => {
  const body = Array.from(
    { length: 20 },
    (_, i) => "    let x" + i + " = " + i + ";",
  ).join("\n");
  const code = [
    "/// Six lines of explanation for twenty-one lines of code.",
    "/// Line two.",
    "/// Line three.",
    "/// Line four.",
    "/// Line five.",
    "/// Line six.",
    "fn work() {",
    body,
    "}",
  ].join("\n");
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("a four-line comment is under the floor", () => {
  const code =
    "/// One.\n/// Two.\n/// Three.\n/// Four.\npub const A: u8 = 1;";
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("a header comment with no following code is not judged", () => {
  const code = [
    "// A file header explains the module as a whole.",
    "// It does not stand for one declaration below it.",
    "",
    "pub const A: u8 = 1;",
  ].join("\n");
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("trailing comments on consecutive lines are not one block", () => {
  const code = [
    "pub const A: u8 = 1; // first note",
    "pub const B: u8 = 2; // second note",
    "pub const C: u8 = 3; // third note",
    "pub const D: u8 = 4; // fourth note",
    "pub const E: u8 = 5; // fifth note",
  ].join("\n");
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

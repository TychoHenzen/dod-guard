// Tests for rules-comments.mjs: the two rules that judge a comment against
// the code under it, plus the marker and dead-code rules that moved here.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { scanFile } from "./rules-file.mjs";

function scan(lang, code, rule) {
  const file = { rel: `src/lib.${lang}`, lang, isTest: false, source: code, lines: code.split("\n") };
  const { violations } = scanFile(file, buildConfig("default"));
  return violations.filter((v) => v.rule === rule);
}

const NARRATED_FIELD = `
pub struct Settings {
    /// Cap on the tokens one API reply may produce, clamped to 1024-65536.
    ///
    /// Defaults to 8192. The cap covers reasoning tokens as well as the
    /// reply, so a thinking model spends part of it before it writes a
    /// single character. It was hardcoded at 4096, and a real autopilot
    /// run showed what that costs: a write call carrying a whole source
    /// file ran past the cap mid-argument, the API stopped early.
    pub max_tokens: Option<u32>,
}
`;

test("a seven-line story over a one-line field is an error", () => {
  const found = scan("rs", NARRATED_FIELD, "comment-bloat");
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "error");
  assert.equal(found[0].metric, 7);
  assert.match(found[0].message, /7-line comment over 1 line/);
});

test("the ratio decides, so a long comment over a long function stays quiet", () => {
  const body = Array.from({ length: 20 }, (_, i) => `    let x${i} = ${i};`).join("\n");
  const code = `
/// Six lines of explanation for twenty-one lines of code.
/// Line two.
/// Line three.
/// Line four.
/// Line five.
/// Line six.
fn work() {
${body}
}
`;
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("a four-line comment is under the floor whatever it documents", () => {
  const code = `
/// One.
/// Two.
/// Three.
/// Four.
pub const A: u8 = 1;
`;
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("a comment with no code under it documents nothing and is not judged", () => {
  const code = `
// A file header runs long on purpose. It explains the module as a whole,
// which is a thing no single declaration below it stands for. Line three.
// Line four. Line five. Line six of the header block.

pub const A: u8 = 1;
`;
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("a comment that only renames the declaration is flagged", () => {
  const code = `
/// The user name.
pub user_name: String,
`;
  const found = scan("rs", code, "comment-restates-code");
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "warn");
});

test("a comment that adds a reason the code cannot state is not flagged", () => {
  const code = `
/// Clamped at 64 because the wire format spends one byte on the length.
pub user_name: String,
`;
  assert.deepEqual(scan("rs", code, "comment-restates-code"), []);
});

test("an attribute between the comment and the field does not hide the restatement", () => {
  const code = `
/// The default backend.
#[serde(default)]
pub default_backend: Option<String>,
`;
  assert.equal(scan("rs", code, "comment-restates-code").length, 1);
});

test("trailing comments on consecutive lines are not one block", () => {
  const code = `
pub const A: u8 = 1; // first of a run of trailing notes on this constant
pub const B: u8 = 2; // second of the run, same shape, same length again
pub const C: u8 = 3; // third of the run, same shape, same length again
pub const D: u8 = 4; // fourth of the run, same shape, same length again
pub const E: u8 = 5; // fifth of the run, same shape, same length again
`;
  assert.deepEqual(scan("rs", code, "comment-bloat"), []);
});

test("a marker is still reported after the move", () => {
  const found = scan("ts", "// TODO: wire this up\nexport const a = 1;\n", "todo-marker");
  assert.equal(found.length, 1);
});

test("commented-out code is still reported after the move", () => {
  const found = scan("ts", "export const a = 1;\n// const b = compute(a);\n", "commented-out-code");
  assert.equal(found.length, 1);
});

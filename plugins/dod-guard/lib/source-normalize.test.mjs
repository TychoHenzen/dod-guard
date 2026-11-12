// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import test from "node:test";
import { sameBehavior } from "./source-normalize.mjs";

const lines = (...rows) => rows.join("\n");

test("ignores an added whole-line comment and blank line in .mjs", () => {
  const before = lines("const a = 1;", "export { a };");
  const after = lines("// new note", "const a = 1;", "", "export { a };");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), true);
});

test("ignores re-indentation in .mjs", () => {
  const before = lines("function f() {", "  return 1;", "}");
  const after = lines("function f() {", "    return 1;", "}");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), true);
});

test("treats a changed code token as a change", () => {
  const before = "const b = 2;";
  const after = "const b = 3;";
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("treats a trailing comment after code as a change", () => {
  const before = "x = 1;";
  const after = "x = 1; // note";
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("keeps .py indentation significant", () => {
  const before = lines("def f():", "    return 1");
  const after = lines("def f():", "  return 1");
  assert.equal(sameBehavior({ before, after, file: "tool.py" }), false);
});

test("allows a # comment line to change in .py", () => {
  const before = lines("# old note", "def f():", "    return 1");
  const after = lines("# new note", "def f():", "    return 1");
  assert.equal(sameBehavior({ before, after, file: "tool.py" }), true);
});

test("returns false for .md", () => {
  const text = lines("# Title", "", "Body text.");
  assert.equal(sameBehavior({ before: text, after: text, file: "README.md" }), false);
});

test("returns false for an unknown extension", () => {
  const text = "some content";
  assert.equal(sameBehavior({ before: text, after: text, file: "data.unknownext" }), false);
});

test("treats a comment-looking line inside a template literal as code", () => {
  const before = lines("const s = `", "// a", "`;");
  const after = lines("const s = `", "// b", "`;");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("treats CRLF and LF text with the same lines as equal", () => {
  const before = "const a = 1;\nexport { a };\n";
  const after = "const a = 1;\r\nexport { a };\r\n";
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), true);
});

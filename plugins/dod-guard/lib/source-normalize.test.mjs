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

test("treats a re-indented template literal body as a change", () => {
  const before = lines("const s = `", "  select 1", "`;");
  const after = lines("const s = `", "      select 1", "`;");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("treats a blank line added inside a template literal as a change", () => {
  const before = lines("const s = `", "a", "b", "`;");
  const after = lines("const s = `", "a", "", "b", "`;");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("treats trailing whitespace after an opening backtick as a change", () => {
  const before = lines("const s = `", "a", "`;");
  const after = lines("const s = `  ", "a", "`;");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("treats trailing whitespace inside a python triple-quoted string as a change", () => {
  const before = lines("s = '''", "text", "'''");
  const after = lines("s = '''", "text  ", "'''");
  assert.equal(sameBehavior({ before, after, file: "tool.py" }), false);
});

test("still ignores re-indentation after a template literal closes", () => {
  const before = lines("const s = `a`;", "function f() {", "  return s;", "}");
  const after = lines("const s = `a`;", "// note", "function f() {", "    return s;", "}");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), true);
});

test("does not let a closed C# verbatim string hold later comments", () => {
  const before = lines('var p = @"C:\\dir";', "// old", "Run(p);");
  const after = lines('var p = @"C:\\dir";', "// new", "", "Run(p);");
  assert.equal(sameBehavior({ before, after, file: "A.cs" }), true);
});

test("does not let a closed Rust raw string hold later comments", () => {
  const before = lines('let p = r#"a "b" c"#;', "// old", "run(p);");
  const after = lines('let p = r#"a "b" c"#;', "// new", "", "run(p);");
  assert.equal(sameBehavior({ before, after, file: "a.rs" }), true);
});

test("treats an edit inside a multi-line C# verbatim string as a change", () => {
  const before = lines('var s = @"one', "  two", 'end";');
  const after = lines('var s = @"one', "    two", 'end";');
  assert.equal(sameBehavior({ before, after, file: "A.cs" }), false);
});

test("skips a doubled quote inside a C# verbatim string", () => {
  const before = lines('var s = @"a ""q', "  b", 'end";');
  const after = lines('var s = @"a ""q', "    b", 'end";');
  assert.equal(sameBehavior({ before, after, file: "A.cs" }), false);
});

test("treats an escaped backtick as string content", () => {
  const before = lines("const s = `a \\` b", "  c", "`;");
  const after = lines("const s = `a \\` b", "    c", "`;");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), false);
});

test("does not open a string from a dropped comment line", () => {
  const before = lines("// it`s here", "const a = 1;", "  run(a);");
  const after = lines("// it`s there", "const a = 1;", "    run(a);");
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), true);
});

test("treats CRLF and LF text with the same lines as equal", () => {
  const before = "const a = 1;\nexport { a };\n";
  const after = "const a = 1;\r\nexport { a };\r\n";
  assert.equal(sameBehavior({ before, after, file: "src/a.mjs" }), true);
});

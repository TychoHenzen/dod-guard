import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filesMatchGlob, matchGlob } from "./solve-glob.js";

describe("matchGlob", () => {
  it("matches nothing when the pattern is empty", () => {
    assert.equal(matchGlob("src/a.ts", ""), false);
    assert.equal(matchGlob("", ""), false);
  });

  it("matches a literal path exactly", () => {
    assert.equal(matchGlob("src/a.ts", "src/a.ts"), true);
    assert.equal(matchGlob("src/a.tsx", "src/a.ts"), false);
    assert.equal(matchGlob("x/src/a.ts", "src/a.ts"), false);
  });

  it("treats a dot in the pattern as a literal dot", () => {
    assert.equal(matchGlob("srcXa.ts", "src.a.ts"), false);
    assert.equal(matchGlob("src.a.ts", "src.a.ts"), true);
  });

  it("keeps a single star inside one path segment", () => {
    assert.equal(matchGlob("src/a.ts", "src/*"), true);
    assert.equal(matchGlob("src/deep/a.ts", "src/*"), false);
    assert.equal(matchGlob("src/a.ts", "src/*.ts"), true);
    assert.equal(matchGlob("src/a.md", "src/*.ts"), false);
  });

  it("lets a single star match an empty run", () => {
    assert.equal(matchGlob("src/.ts", "src/*.ts"), true);
  });

  it("lets a double star cross path segments", () => {
    assert.equal(matchGlob("src/a.ts", "src/**"), true);
    assert.equal(matchGlob("src/deep/deeper/a.ts", "src/**"), true);
    assert.equal(matchGlob("docs/a.ts", "src/**"), false);
  });

  it("lets a trailing-slash double star match zero segments", () => {
    assert.equal(matchGlob("src/a.ts", "src/**/a.ts"), true);
    assert.equal(matchGlob("src/deep/a.ts", "src/**/a.ts"), true);
    assert.equal(matchGlob("src/deep/deeper/a.ts", "src/**/a.ts"), true);
    assert.equal(matchGlob("src/deep/a.md", "src/**/a.ts"), false);
  });

  it("matches exactly one non-slash character with a question mark", () => {
    assert.equal(matchGlob("a.ts", "?.ts"), true);
    assert.equal(matchGlob("ab.ts", "?.ts"), false);
    assert.equal(matchGlob(".ts", "?.ts"), false);
    assert.equal(matchGlob("a/ts", "?/ts"), true);
    assert.equal(matchGlob("a/b.ts", "?.ts"), false);
  });

  it("escapes regex metacharacters in a literal run", () => {
    assert.equal(matchGlob("a+b.ts", "a+b.ts"), true);
    assert.equal(matchGlob("aab.ts", "a+b.ts"), false);
    assert.equal(matchGlob("a(b).ts", "a(b).ts"), true);
    assert.equal(matchGlob("a$b", "a$b"), true);
    assert.equal(matchGlob("a|b", "a|b"), true);
  });

  it("anchors the whole path, not a substring", () => {
    assert.equal(matchGlob("test/src/a.ts", "src/**"), false);
    assert.equal(matchGlob("src/a.ts.bak", "src/*.ts"), false);
  });
});

/** A minimal unified diff header pair for one touched file. */
function header(before: string, after = before): string {
  return `diff --git a/${before} b/${after}\n--- a/${before}\n+++ b/${after}\n@@ -1 +1 @@\n-old\n+new\n`;
}

describe("filesMatchGlob", () => {
  it("allows everything when no pattern list is given", () => {
    assert.deepEqual(filesMatchGlob(header("docs/b.md")), []);
    assert.deepEqual(filesMatchGlob(header("docs/b.md"), []), []);
  });

  it("reports nothing for a blank diff", () => {
    assert.deepEqual(filesMatchGlob("", ["src/**"]), []);
    assert.deepEqual(filesMatchGlob("   \n  ", ["src/**"]), []);
  });

  it("reports only the files no pattern covers", () => {
    const diff = header("src/a.ts") + header("docs/b.md");
    assert.deepEqual(filesMatchGlob(diff, ["src/**"]), ["docs/b.md"]);
  });

  it("reports nothing when every file is covered", () => {
    const diff = header("src/a.ts") + header("docs/b.md");
    assert.deepEqual(filesMatchGlob(diff, ["src/**", "docs/*.md"]), []);
  });

  it("accepts a file that any one of the patterns covers", () => {
    assert.deepEqual(filesMatchGlob(header("docs/b.md"), ["src/**", "docs/**"]), []);
  });

  it("reports a repeated file once", () => {
    const diff = header("docs/b.md") + header("docs/b.md");
    assert.deepEqual(filesMatchGlob(diff, ["src/**"]), ["docs/b.md"]);
  });

  it("reads the destination side of a rename", () => {
    assert.deepEqual(filesMatchGlob(header("src/old.ts", "docs/new.md"), ["src/**"]), ["docs/new.md"]);
  });

  it("keeps a path that holds a space", () => {
    assert.deepEqual(filesMatchGlob(header("docs/my file.md"), ["src/**"]), ["docs/my file.md"]);
  });

  it("ignores diff text that has no file header", () => {
    assert.deepEqual(filesMatchGlob("+added a line\n-removed a line\n", ["src/**"]), []);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { slashPath } from "./slash-path.mjs";

test("backslashes become forward slashes", () => {
  assert.equal(slashPath("docs\\nested\\file.md"), "docs/nested/file.md");
});

test("a forward-slash path is unchanged", () => {
  assert.equal(slashPath("docs/file.md"), "docs/file.md");
});

test("a non-string is stringified before the separators are replaced", () => {
  assert.equal(slashPath(42), "42");
});

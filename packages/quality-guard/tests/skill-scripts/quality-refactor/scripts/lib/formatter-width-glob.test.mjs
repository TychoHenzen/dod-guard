// The glob matcher escapes every regex metacharacter in a literal segment,
// backslash included, so a pattern can never be read as a regex escape.

import assert from "node:assert/strict";
import { test } from "node:test";
import { listIncludes } from "../../../../../skills/quality-refactor/scripts/lib/formatter-width-glob.mjs";

test("a backslash in a literal segment matches only itself", () => {
  assert.equal(listIncludes(["a\\d.ts"], "a\\d.ts"), true);
  assert.equal(listIncludes(["a\\d.ts"], "a5.ts"), false);
});

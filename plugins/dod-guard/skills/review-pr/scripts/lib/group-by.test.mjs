import assert from "node:assert/strict";
import test from "node:test";
import { groupBy } from "./group-by.mjs";

test("items group under their key in first-seen key order and input order", () => {
  const items = [
    { file: "b.md", line: 1 },
    { file: "a.md", line: 2 },
    { file: "b.md", line: 3 },
  ];
  const groups = groupBy(items, "file");
  assert.deepEqual([...groups.keys()], ["b.md", "a.md"]);
  assert.deepEqual(groups.get("b.md"), [items[0], items[2]]);
  assert.deepEqual(groups.get("a.md"), [items[1]]);
});

test("an empty list gives an empty map", () => {
  assert.equal(groupBy([], "file").size, 0);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const rules = await readFile(
  new URL(
    "../../../../../skills/quality-refactor/reference/rules.md",
    import.meta.url,
  ),
  "utf8",
);

test("file-length guidance keeps partial classes as a documented exception", () => {
  const start = rules.indexOf("## `file-length`");
  const end = rules.indexOf("## `function-length`", start);
  assert.notEqual(start, -1, "file-length heading is required");
  assert.notEqual(end, -1, "function-length heading is required");
  const fileLength = rules.slice(start, end).replace(/\s+/g, " ");
  for (const signal of [
    "Do not introduce partial classes solely to satisfy numeric file or line limits",
    "partial class is appropriate only for a strong, documented",
    "leave a cohesive class alone",
  ]) {
    assert.ok(
      fileLength.includes(signal),
      `file-length guidance must contain ${signal}`,
    );
  }
});

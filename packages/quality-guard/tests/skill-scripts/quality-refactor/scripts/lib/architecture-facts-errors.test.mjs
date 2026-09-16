import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "../../../../../skills/quality-refactor/scripts/lib/architecture-facts.mjs";

test(
  "a changed supported file that cannot yield required facts reports an " +
    "explicit error",
  () => {
    const result = extractArchitectureFacts({
      path: "src/broken.ts",
      content: "export class Broken {",
    });
    assert.equal(result.facts, null);
    assert.match(
      result.errors[0] ?? "",
      /cannot extract required architecture facts/i,
    );
  },
);

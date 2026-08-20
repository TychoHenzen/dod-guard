import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runtimeRoot } from "./runtime-root.js";

describe("runtimeRoot", () => {
  it("resolves bundled resources from the installed module location", () => {
    const expected = path.resolve(fileURLToPath(import.meta.url), "..", "..");

    assert.equal(runtimeRoot, expected);
    assert.ok(existsSync(path.join(runtimeRoot, "package.json")));
  });
});

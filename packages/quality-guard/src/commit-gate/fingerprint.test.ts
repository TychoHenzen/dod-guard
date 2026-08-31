import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { fingerprintSnapshot } from "./fingerprint.js";

test("fingerprints source content but ignores documentation content", () => {
  const config = parseQualityConfig("{}");
  const source = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "target",
      changes: [{ kind: "add", after: { path: "src/a.ts", content: "export const value = 1;" } }],
    },
    config,
  );
  const changedSource = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "target",
      changes: [{ kind: "add", after: { path: "src/a.ts", content: "export const value = 2;" } }],
    },
    config,
  );
  const documentationOnly = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "target",
      changes: [{ kind: "add", after: { path: "README.md", content: "documentation" } }],
    },
    config,
  );

  assert.notEqual(source, changedSource);
  assert.equal(documentationOnly.length, 64);
  assert.equal(source.length, 64);
});

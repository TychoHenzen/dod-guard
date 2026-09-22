import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { fingerprintSnapshot } from "../../../src/commit-gate/fingerprint.js";

test("fingerprints source content but ignores documentation content", () => {
  const config = parseQualityConfig("{}");
  const source = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "target",
      changes: [
        {
          kind: "add",
          after: { path: "src/a.ts", content: "export const value = 1;" },
        },
      ],
    },
    config,
  );
  const changedSource = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "target",
      changes: [
        {
          kind: "add",
          after: { path: "src/a.ts", content: "export const value = 2;" },
        },
      ],
    },
    config,
  );
  const documentationOnly = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "target",
      changes: [
        { kind: "add", after: { path: "README.md", content: "documentation" } },
      ],
    },
    config,
  );
  const changedTarget = fingerprintSnapshot(
    {
      baseIdentity: "base",
      targetIdentity: "different-target",
      changes: [
        {
          kind: "add",
          after: { path: "src/a.ts", content: "export const value = 1;" },
        },
      ],
    },
    config,
  );

  assert.notEqual(source, changedSource);
  assert.notEqual(source, changedTarget);
  assert.equal(documentationOnly.length, 64);
  assert.equal(source.length, 64);
});

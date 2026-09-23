import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendArchitectureAcknowledgement,
  parseArchitectureAcknowledgements,
} from "../../../src/commit-gate/acknowledgements.js";

const trackedRecord = {
  findingId: "finding",
  fingerprint: "a".repeat(64),
  baseIdentity: "base",
  targetIdentity: "target",
  reason: "Reviewed with the team",
  author: "A. Reviewer",
  time: "2026-08-31T00:00:00.000Z",
};

test("stores tracked acknowledgement fields", () => {
  const output = appendArchitectureAcknowledgement("[]", trackedRecord);
  assert.deepEqual(parseArchitectureAcknowledgements(output), [trackedRecord]);
});

test("keeps legacy acknowledgement records parseable but rejects partial provenance", () => {
  assert.deepEqual(
    parseArchitectureAcknowledgements(
      `[{"findingId":"a","fingerprint":"${"b".repeat(64)}","reason":"c","author":"d","time":"e"}]`,
    ),
    [
      {
        findingId: "a",
        fingerprint: "b".repeat(64),
        reason: "c",
        author: "d",
        time: "e",
      },
    ],
  );
  assert.throws(
    () =>
      parseArchitectureAcknowledgements(
        `[{"findingId":"a","fingerprint":"${"b".repeat(64)}","baseIdentity":"base","reason":"c","author":"d","time":"e"}]`,
      ),
    /both baseIdentity and targetIdentity/,
  );
});

test("rejects decision records with unsupported or missing fields", () => {
  assert.throws(
    () =>
      parseArchitectureAcknowledgements(
        '[{"findingId":"a","fingerprint":"b","reason":"c",' +
          '"author":"d","time":"e","extra":true}]',
      ),
    /not supported/,
  );
  assert.throws(
    () => parseArchitectureAcknowledgements('[{"findingId":"a"}]'),
    /fingerprint/,
  );
});

test("rejects malformed fingerprint shapes with their record path", () => {
  for (const fingerprint of [
    "a".repeat(63),
    "a".repeat(65),
    "g".repeat(64),
    "A".repeat(64),
  ]) {
    assert.throws(
      () =>
        parseArchitectureAcknowledgements(
          JSON.stringify([
            {
              ...trackedRecord,
              fingerprint,
            },
          ]),
        ),
      /architecture-decisions\.json\[0\]\.fingerprint must be a 64-character lowercase hexadecimal SHA-256 fingerprint/,
    );
  }
});

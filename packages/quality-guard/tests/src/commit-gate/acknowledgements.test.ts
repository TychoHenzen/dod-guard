import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendArchitectureAcknowledgement,
  parseArchitectureAcknowledgements,
} from "../../../src/commit-gate/acknowledgements.js";

const VALID_FINGERPRINT = "a".repeat(64);
const LEGACY_FINGERPRINT = "b".repeat(64);
const SHORT_FINGERPRINT = "a".repeat(63);
const LONG_FINGERPRINT = "a".repeat(65);
const MALFORMED_FINGERPRINT_ERROR = new RegExp(
  "architecture-decisions\\.json\\[0\\]\\.fingerprint must be a " +
    "64-character lowercase hexadecimal SHA-256 fingerprint",
);
const trackedRecord = {
  findingId: "finding",
  fingerprint: VALID_FINGERPRINT,
  baseIdentity: "base",
  targetIdentity: "target",
  reason: "Reviewed with the team",
  author: "A. Reviewer",
  time: "2026-08-31T00:00:00.000Z",
};
const legacyRecord = {
  findingId: "a",
  fingerprint: LEGACY_FINGERPRINT,
  reason: "c",
  author: "d",
  time: "e",
};

test("stores tracked acknowledgement fields", () => {
  const output = appendArchitectureAcknowledgement("[]", trackedRecord);
  assert.deepEqual(parseArchitectureAcknowledgements(output), [trackedRecord]);
});

test("keeps legacy acknowledgement records parseable but rejects partial provenance", () => {
  assert.deepEqual(
    parseArchitectureAcknowledgements(JSON.stringify([legacyRecord])),
    [legacyRecord],
  );
  const partialRecord = { ...legacyRecord, baseIdentity: "base" };
  assert.throws(
    () => parseArchitectureAcknowledgements(JSON.stringify([partialRecord])),
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
    SHORT_FINGERPRINT,
    LONG_FINGERPRINT,
    VALID_FINGERPRINT.replaceAll("a", "g"),
    VALID_FINGERPRINT.toUpperCase(),
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
      MALFORMED_FINGERPRINT_ERROR,
    );
  }
});

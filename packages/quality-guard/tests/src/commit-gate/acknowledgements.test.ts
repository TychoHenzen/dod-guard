import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendArchitectureAcknowledgement,
  parseArchitectureAcknowledgements,
} from "../../../src/commit-gate/acknowledgements.js";

const trackedRecord = {
  findingId: "finding",
  fingerprint: "fingerprint",
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
      '[{"findingId":"a","fingerprint":"b","reason":"c","author":"d","time":"e"}]',
    ),
    [
      {
        findingId: "a",
        fingerprint: "b",
        reason: "c",
        author: "d",
        time: "e",
      },
    ],
  );
  assert.throws(
    () =>
      parseArchitectureAcknowledgements(
        '[{"findingId":"a","fingerprint":"b","baseIdentity":"base","reason":"c","author":"d","time":"e"}]',
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

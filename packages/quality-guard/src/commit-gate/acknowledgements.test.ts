import assert from "node:assert/strict";
import { test } from "node:test";
import { appendArchitectureAcknowledgement, parseArchitectureAcknowledgements } from "./acknowledgements.js";

test("stores the exact tracked acknowledgement fields in append-only order", () => {
  const output = appendArchitectureAcknowledgement("[]", {
    findingId: "finding",
    fingerprint: "fingerprint",
    reason: "Reviewed with the team",
    author: "A. Reviewer",
    time: "2026-08-31T00:00:00.000Z",
  });
  assert.deepEqual(parseArchitectureAcknowledgements(output), [
    {
      findingId: "finding",
      fingerprint: "fingerprint",
      reason: "Reviewed with the team",
      author: "A. Reviewer",
      time: "2026-08-31T00:00:00.000Z",
    },
  ]);
});

test("rejects decision records with unsupported or missing fields", () => {
  assert.throws(
    () =>
      parseArchitectureAcknowledgements(
        '[{"findingId":"a","fingerprint":"b","reason":"c","author":"d","time":"e","extra":true}]',
      ),
    /not supported/,
  );
  assert.throws(() => parseArchitectureAcknowledgements('[{"findingId":"a"}]'), /fingerprint/);
});

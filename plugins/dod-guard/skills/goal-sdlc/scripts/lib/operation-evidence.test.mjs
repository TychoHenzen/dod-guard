// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { createHash } from "node:crypto";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { awaitOperation, operationFailureEvidence } from "./operation-evidence.mjs";

const SHA256_LENGTH = 64;
const SECRET_PATTERN = /secret/;
const HASH_MISMATCH_PATTERN = /verified operation bytes hash mismatch/;

test("waits on the same active handle and does not replace a quiet operation", async () => {
  const handle = { id: "session-1" };
  const seen = [];
  const result = await awaitOperation({
    handle,
    wait: (value) => {
      seen.push(value);
      return { state: "completed" };
    },
  });

  assert.deepEqual(seen, [handle]);
  assert.deepEqual(result, { kind: "terminal", handle, result: { state: "completed" } });
});

test("keeps polling the same handle while the provider reports an active state", async () => {
  const handle = { id: "session-running" };
  const seen = [];
  const results = [{ state: "running" }, { state: "completed" }];
  const result = await awaitOperation({
    handle,
    wait: (value) => {
      seen.push(value);
      return results.shift();
    },
  });

  assert.deepEqual(seen, [handle, handle]);
  assert.deepEqual(result, { kind: "terminal", handle, result: { state: "completed" } });
});

test("records operator cancellation without polling or retrying", async () => {
  let waits = 0;
  const handle = "session-2";
  const result = await awaitOperation({
    handle,
    cancelledByOperator: true,
    wait: () => {
      waits += 1;
    },
  });

  assert.deepEqual(result, { kind: "operator-cancellation", handle });
  assert.equal(waits, 0);
});

test("separates provider CreateProcess rejection and preserves redacted bytes and hash", () => {
  const verifiedBytes = "verified command output";
  const evidence = operationFailureEvidence({
    handle: "session-3",
    command: ["node", "acceptance.mjs"],
    headSha: "head-3",
    verifiedBytes,
    expectedSha256: createHash("sha256").update(verifiedBytes).digest("hex"),
    error: Object.assign(new Error("CreateProcess for token=secret rejected by policy"), { code: "EPERM" }),
  });

  assert.equal(evidence.kind, "provider-rejection");
  assert.equal(evidence.retryAllowed, false);
  assert.equal(evidence.sha256, createHash("sha256").update(verifiedBytes).digest("hex"));
  assert.equal(Buffer.from(evidence.verifiedBytes, "base64").toString("utf8"), verifiedBytes);
  assert.doesNotMatch(evidence.failure.message, SECRET_PATTERN);
});

test("rejects a changed verified-byte hash before recording evidence", () => {
  assert.throws(
    () => operationFailureEvidence({
      handle: "session-4",
      command: "node acceptance.mjs",
      verifiedBytes: "actual",
      expectedSha256: "0".repeat(SHA256_LENGTH),
    }),
    HASH_MISMATCH_PATTERN,
  );
});

// biome-ignore lint/correctness/noNodejsModules: This helper preserves exact operation evidence under Node.js.
import { createHash } from "node:crypto";
import { classifyTransportFailure } from "../../../../lib/transport-policy.mjs";

const CREATE_PROCESS_POLICY_REJECTION = /CreateProcess[\s\S]*rejected by policy/i;

function requireHandle(handle) {
  if (handle === null || handle === undefined || handle === "") {
    throw new TypeError("active operation handle is required.");
  }
  return handle;
}

function commandValue(command) {
  if (Array.isArray(command) && command.length > 0) {
    return [...command];
  }
  if (typeof command === "string" && command.length > 0) {
    return command;
  }
  throw new TypeError("operation command is required.");
}

function verifiedBytesValue(verifiedBytes) {
  if (Buffer.isBuffer(verifiedBytes)) {
    return Buffer.from(verifiedBytes);
  }
  if (verifiedBytes instanceof Uint8Array) {
    return Buffer.from(verifiedBytes);
  }
  if (typeof verifiedBytes === "string") {
    return Buffer.from(verifiedBytes, "utf8");
  }
  throw new TypeError("verified operation bytes are required.");
}

function operationBytesEvidence(verifiedBytes, expectedSha256) {
  const bytes = verifiedBytesValue(verifiedBytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== undefined && expectedSha256 !== sha256) {
    throw new Error(`verified operation bytes hash mismatch: expected ${expectedSha256}, found ${sha256}.`);
  }
  return { value: bytes.toString("base64"), sha256 };
}

async function awaitOperation({ handle, wait, cancelledByOperator = false } = {}) {
  const activeHandle = requireHandle(handle);
  if (cancelledByOperator) {
    return { kind: "operator-cancellation", handle: activeHandle };
  }
  if (typeof wait !== "function") {
    throw new TypeError("operation wait function is required.");
  }
  const result = await wait(activeHandle);
  return { kind: "terminal", handle: activeHandle, result };
}

function operationFailureEvidence({
  handle,
  command,
  headSha,
  verifiedBytes,
  expectedSha256,
  error,
  cancelledByOperator = false,
} = {}) {
  const activeHandle = requireHandle(handle);
  const bytes = operationBytesEvidence(verifiedBytes, expectedSha256);
  let failure = null;
  if (error) {
    failure = classifyTransportFailure(error, "provider");
  }
  const providerRejection = failure && CREATE_PROCESS_POLICY_REJECTION.test(failure.message);
  let kind = "provider-failure";
  if (cancelledByOperator) {
    kind = "operator-cancellation";
  } else if (providerRejection) {
    kind = "provider-rejection";
  }
  let failureEvidence = null;
  if (failure) {
    failureEvidence = {
      category: failure.category,
      code: failure.code,
      status: failure.status,
      message: failure.message,
    };
  }
  return {
    kind,
    handle: activeHandle,
    command: commandValue(command),
    headSha: headSha ?? null,
    verifiedBytes: bytes.value,
    sha256: bytes.sha256,
    failure: failureEvidence,
    retryAllowed: false,
  };
}

export { awaitOperation, operationFailureEvidence };

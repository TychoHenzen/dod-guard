import {
  addBinaryReferenceWarning,
  addReferenceWarning,
} from "./reference-read-support.js";
import type { ReferenceSourceSnapshot } from "./reference-analysis-types.js";
import type { StableReadInput } from "./reference-read-stable-types.js";

type StableReferenceSourceRead = {
  readonly content: string;
  readonly byteLength: number;
};

function maximumReadableBytes(input: StableReadInput): number {
  return Math.min(
    input.maximumFileBytes,
    input.maximumTotalBytes - input.budget.acceptedBytes,
  );
}

function normalizeStableRead(result: string | StableReferenceSourceRead): {
  content: string;
  byteLength: number;
} {
  if (typeof result === "string")
    return { content: result, byteLength: Buffer.byteLength(result) };
  return result;
}

function isInvalidByteLength(
  byteLength: number,
  maximumBytes: number,
): boolean {
  return (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > maximumBytes
  );
}

function addContentLimitWarning(input: StableReadInput): void {
  addReferenceWarning({
    ...input.collections,
    source: input.source,
    code: "reference_content_limit",
    message: "Reference source exceeds the bounded read limit.",
  });
}

function addUnreadableWarning(input: StableReadInput): void {
  addReferenceWarning({
    ...input.collections,
    source: input.source,
    code: "reference_unreadable",
    message: "Reference source could not be read.",
  });
}

export function readStableContent(
  input: StableReadInput,
  initial: ReferenceSourceSnapshot,
): void {
  try {
    const maximumBytes = maximumReadableBytes(input);
    const result = normalizeStableRead(
      input.boundary.read(input.source, maximumBytes, initial),
    );
    if (isInvalidByteLength(result.byteLength, maximumBytes)) {
      addContentLimitWarning(input);
      return;
    }
    if (result.content.includes("\0")) {
      addBinaryReferenceWarning({ ...input.collections, source: input.source });
      return;
    }
    input.collections.readableSources.push({
      ...input.source,
      content: result.content,
    });
    input.budget.acceptedBytes += result.byteLength;
  } catch {
    addUnreadableWarning(input);
  }
}

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ReferenceCandidate,
  ReferenceSourceSnapshot,
} from "./repository-analysis-reference-boundary.js";

function descriptorIdentity(metadata: {
  dev: number | bigint;
  ino: number | bigint;
}): string {
  return process.platform === "win32"
    ? String(metadata.ino)
    : `${metadata.dev}:${metadata.ino}`;
}

export function inspectReferenceSource(
  root: string,
  source: ReferenceCandidate,
): ReferenceSourceSnapshot {
  const fullPath = join(root, source.path);
  const metadata = lstatSync(fullPath);
  return {
    identity: descriptorIdentity(metadata),
    isRegularFile: metadata.isFile(),
    byteLength: metadata.size,
    canonicalPath: realpathSync(fullPath),
  };
}

function matchesInitialSnapshot(
  metadata: ReturnType<typeof fstatSync>,
  initial: ReferenceSourceSnapshot,
): boolean {
  return (
    metadata.isFile() &&
    descriptorIdentity(metadata) === initial.identity &&
    metadata.size === initial.byteLength
  );
}

function readDescriptor(descriptor: number, maximumBytes: number) {
  const buffer = Buffer.allocUnsafe(maximumBytes);
  let byteLength = 0;
  while (byteLength < maximumBytes) {
    const bytesRead = readSync(
      descriptor,
      buffer,
      byteLength,
      maximumBytes - byteLength,
      null,
    );
    if (bytesRead === 0) break;
    byteLength += bytesRead;
  }
  return {
    content: buffer.subarray(0, byteLength).toString("utf8"),
    byteLength,
  };
}

export function readReferenceSource({
  root,
  source,
  maximumBytes,
  initial,
}: {
  root: string;
  source: ReferenceCandidate;
  maximumBytes: number;
  initial: ReferenceSourceSnapshot;
}) {
  const noFollow =
    (constants as { readonly O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const descriptor = openSync(
    join(root, source.path),
    constants.O_RDONLY | noFollow,
  );
  try {
    if (!matchesInitialSnapshot(fstatSync(descriptor), initial))
      throw new Error("Reference descriptor changed before reading.");
    const result = readDescriptor(descriptor, maximumBytes);
    if (!matchesInitialSnapshot(fstatSync(descriptor), initial))
      throw new Error("Reference descriptor changed during reading.");
    return result;
  } finally {
    closeSync(descriptor);
  }
}

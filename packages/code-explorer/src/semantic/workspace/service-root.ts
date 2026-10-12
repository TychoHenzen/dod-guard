import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type OwnedResources, ownedResources } from "./owned-resources.js";

export const OWNER_MARKER_FILE = "owner.json";
export const SERVICE_ROOT_PREFIXES = [
  "code-explorer-native-",
  "code-explorer-pyright-",
] as const;
export type ServiceRootPrefix = (typeof SERVICE_ROOT_PREFIXES)[number];

/**
 * The root is tracked before the marker is written, and the marker is written
 * before any copy, so a sweep can always attribute a root to its owner.
 */
export function createOwnedServiceRoot(
  prefix: ServiceRootPrefix,
  resources: OwnedResources = ownedResources,
): { path: string; release(): void } {
  resources.assertOpen();
  const path = mkdtempSync(join(tmpdir(), prefix));
  const release = resources.trackRoot(path);
  try {
    writeFileSync(
      join(path, OWNER_MARKER_FILE),
      `${JSON.stringify({ pid: process.pid })}\n`,
    );
  } catch (error) {
    release();
    throw error;
  }
  return { path, release };
}

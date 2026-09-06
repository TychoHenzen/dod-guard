import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";

export function snapshotAllowlistEntry(
  entry: BackendAllowlistEntry,
): BackendAllowlistEntry {
  return {
    language: entry.language,
    executable_basename: entry.executable_basename,
    entrypoint_basenames: entry.entrypoint_basenames
      ? [...entry.entrypoint_basenames]
      : [],
    executable_sha256: entry.executable_sha256,
    entrypoint_sha256s: entry.entrypoint_sha256s
      ? [...entry.entrypoint_sha256s]
      : [],
    package_metadata_sha256: entry.package_metadata_sha256 ?? null,
    compatible_version: entry.compatible_version,
    arguments: [...entry.arguments],
    endpoint: entry.endpoint,
    environment: { ...entry.environment },
    safe_initialization_options: cloneValue(entry.safe_initialization_options),
    sentinel_passed: entry.sentinel_passed,
  };
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        cloneValue(child),
      ]),
    ) as T;
  return value;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

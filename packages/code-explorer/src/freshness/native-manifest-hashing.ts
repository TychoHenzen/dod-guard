import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { NativeManifestOptions } from "./native-manifest-options.js";

async function stableHash(
  path: string,
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<string | "incomplete_write" | "scan_limit"> {
  const started = now();
  for (;;) {
    const stable = await stableAttempt(path, sleep);
    if (stable) return stable;
    if (now() - started >= 10_000) return "incomplete_write";
  }
}

async function stableAttempt(
  path: string,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<string | "scan_limit" | undefined> {
  const file = await open(path, "r");
  try {
    const before = await file.stat();
    if (before.size > 4 * 1024 * 1024) return "scan_limit";
    await sleep(100);
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      return undefined;
    return createHash("sha256")
      .update(await file.readFile())
      .digest("hex");
  } finally {
    await file.close();
  }
}

async function stableBatch(
  options: NativeManifestOptions,
  files: readonly string[],
) {
  return await Promise.all(
    files.map(
      async (file) =>
        [
          file,
          await stableHash(
            join(options.root, file),
            options.now ?? Date.now,
            options.sleep ?? delay,
          ),
        ] as const,
    ),
  );
}

export { stableBatch };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve_) => setTimeout(resolve_, milliseconds));
}

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ReconcileResult } from "./types.js";

export type NativeManifestOptions = {
  root: string;
  supported: (path: string) => boolean;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export async function reconcileNativeManifest(options: NativeManifestOptions): Promise<ReconcileResult> {
  const started = (options.now ?? Date.now)();
  try {
    const files = await supportedFiles(options.root, options.supported, started, options.now ?? Date.now);
    const manifest = new Map<string, string>();
    for (let offset = 0; offset < files.length; offset += 64) {
      const stable = await stableBatch(options, files.slice(offset, offset + 64));
      for (const [file, hash] of stable) {
        if (hash === "incomplete_write") return { cause: hash };
        if (hash === "scan_limit") return { cause: hash };
        manifest.set(file, hash);
      }
    }
    return { manifest };
  } catch (error) {
    return { cause: error instanceof Error && error.message === "scan_limit" ? "scan_limit" : "freshness_unavailable" };
  }
}

async function stableBatch(options: NativeManifestOptions, files: readonly string[]) {
  return await Promise.all(
    files.map(
      async (file) =>
        [file, await stableHash(join(options.root, file), options.now ?? Date.now, options.sleep ?? delay)] as const,
    ),
  );
}

async function supportedFiles(
  root: string,
  supported: (path: string) => boolean,
  started: number,
  now: () => number,
): Promise<string[]> {
  const output: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    if (now() - started > 60_000 || output.length > 50_000) throw new Error("scan_limit");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!/^(node_modules|\.git|\.hg|\.svn|\.venv|venv)$/iu.test(entry.name)) await visit(absolute);
      } else {
        const path = relative(root, absolute).replaceAll("\\", "/");
        if (supported(path)) output.push(path);
      }
    }
  };
  await visit(root);
  if (output.length > 50_000) throw new Error("scan_limit");
  return output.sort();
}

async function stableHash(
  path: string,
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<string | "incomplete_write" | "scan_limit"> {
  const started = now();
  for (;;) {
    const before = await stat(path);
    if (before.size > 4 * 1024 * 1024) return "scan_limit";
    await sleep(100);
    const after = await stat(path);
    if (before.size === after.size && before.mtimeMs === after.mtimeMs)
      return createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
    if (now() - started >= 10_000) return "incomplete_write";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve_) => setTimeout(resolve_, milliseconds));
}

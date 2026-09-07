import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

function withinScanLimits(
  started: number,
  now: () => number,
  output: readonly string[],
): void {
  if (now() - started > 60_000 || output.length > 50_000)
    throw new Error("scan_limit");
}

function ignoredDirectory(name: string): boolean {
  return /^(node_modules|\.git|\.hg|\.svn|\.venv|venv)$/iu.test(name);
}

async function visit(
  root: string,
  directory: string,
  supported: (path: string) => boolean,
  started: number,
  now: () => number,
  output: string[],
): Promise<void> {
  withinScanLimits(started, now, output);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectory(entry.name))
        await visit(root, absolute, supported, started, now, output);
      continue;
    }
    const path = relative(root, absolute).replaceAll("\\", "/");
    if (supported(path)) output.push(path);
  }
}

export async function walkSupportedFiles(
  root: string,
  supported: (path: string) => boolean,
  started: number,
  now: () => number,
): Promise<string[]> {
  const output: string[] = [];
  await visit(root, root, supported, started, now, output);
  if (output.length > 50_000) throw new Error("scan_limit");
  return output.sort();
}

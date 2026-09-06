import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeTreeReadOnly,
  makeTreeWritable,
} from "./python-mirror-permissions.js";
import type { PythonMirrorSnapshot } from "./python-mirror-snapshot.js";
import { BUNDLED_TYPESHED } from "./python-mirror-typeshed.js";
import { writeMirrorFile } from "./python-mirror-writer.js";

export function createMirrorTree(
  generation: number,
  snapshot: PythonMirrorSnapshot,
): { serviceRoot: string; mirrorRoot: string } {
  const serviceRoot = mkdtempSync(join(tmpdir(), "code-explorer-pyright-"));
  const mirrorRoot = join(serviceRoot, `generation-${generation}`);
  try {
    mkdirSync(mirrorRoot, { recursive: true, mode: 0o755 });
    writeMirrorFile(mirrorRoot, "pyrightconfig.json", "{}\n");
    for (const input of snapshot.inputs)
      writeMirrorFile(mirrorRoot, input.path, input.text);
    for (const [path, text] of Object.entries(BUNDLED_TYPESHED))
      writeMirrorFile(mirrorRoot, path, text);
    makeTreeReadOnly(mirrorRoot);
    return { serviceRoot, mirrorRoot };
  } catch (error) {
    makeTreeWritable(serviceRoot);
    rmSync(serviceRoot, { recursive: true, force: true });
    throw error;
  }
}

export function createDisposer(serviceRoot: string): {
  dispose(): void;
  disposed(): boolean;
} {
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    process.removeListener("exit", dispose);
    makeTreeWritable(serviceRoot);
    rmSync(serviceRoot, { recursive: true, force: true });
  };
  process.once("exit", dispose);
  return { dispose, disposed: () => disposed };
}

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeTreeReadOnly,
  makeTreeWritable,
} from "./python-mirror-permissions.js";
import type { PythonMirrorPlan } from "./python-mirror-plan.js";
import { BUNDLED_TYPESHED } from "./python-mirror-typeshed.js";
import { writeMirrorFile } from "./python-mirror-writer.js";

export function createMirrorTree(
  plan: Extract<PythonMirrorPlan, { status: "ready" }>,
): { serviceRoot: string; mirrorRoot: string } {
  const generation = plan.generation;
  const serviceRoot = mkdtempSync(join(tmpdir(), "code-explorer-pyright-"));
  const mirrorRoot = join(serviceRoot, `generation-${generation}`);
  try {
    mkdirSync(mirrorRoot, { recursive: true, mode: 0o755 });
    writeMirrorFile(
      mirrorRoot,
      "pyrightconfig.json",
      `${JSON.stringify(plan.minimal_pyrightconfig)}\n`,
    );
    for (const file of plan.files)
      writeMirrorFile(mirrorRoot, file.path, file.text);
    for (const path of plan.bundled_typeshed) {
      const text = (BUNDLED_TYPESHED as Readonly<Record<string, string>>)[
        path
      ];
      if (text === undefined) throw new Error("unsafe_backend_mode");
      writeMirrorFile(mirrorRoot, path, text);
    }
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

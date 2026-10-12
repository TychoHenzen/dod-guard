import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createOwnedServiceRoot } from "../workspace/service-root.js";
import { makeTreeReadOnly } from "./python-mirror-permissions.js";
import type { PythonMirrorPlan } from "./python-mirror-plan.js";
import { BUNDLED_TYPESHED } from "./python-mirror-typeshed.js";
import { writeMirrorFile } from "./python-mirror-writer.js";

export function createMirrorTree(
  plan: Extract<PythonMirrorPlan, { status: "ready" }>,
): { mirrorRoot: string; release: () => void } {
  const generation = plan.generation;
  const service = createOwnedServiceRoot("code-explorer-pyright-");
  const mirrorRoot = join(service.path, `generation-${generation}`);
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
      const text = (BUNDLED_TYPESHED as Readonly<Record<string, string>>)[path];
      if (text === undefined) throw new Error("unsafe_backend_mode");
      writeMirrorFile(mirrorRoot, path, text);
    }
    makeTreeReadOnly(mirrorRoot);
    return { mirrorRoot, release: service.release };
  } catch (error) {
    service.release();
    throw error;
  }
}

export function createDisposer(release: () => void): {
  dispose(): void;
  disposed(): boolean;
} {
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    release();
  };
  return { dispose, disposed: () => disposed };
}

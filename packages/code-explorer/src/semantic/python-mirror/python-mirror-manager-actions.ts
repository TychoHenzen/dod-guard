import type { ProjectRoot } from "../project-root/project-root.js";
import { createMirror } from "./python-mirror-generation.js";
import type { ActiveMirror } from "./python-mirror-manager.js";
import type { PythonMirrorApi } from "./python-mirror-runtime-types.js";
import { snapshotPythonProject } from "./python-mirror-snapshot.js";

export async function refreshManager(input: {
  root: ProjectRoot;
  active(): ActiveMirror | undefined;
  setActive(value: ActiveMirror | undefined): void;
  nextGeneration(): number;
  terminateOldBackend: () => void | Promise<void>;
}): Promise<
  | {
      status: "ready";
      mirror: PythonMirrorApi["mirror"];
      changed: boolean;
    }
  | { status: "unavailable"; code: "unsafe_backend_mode" }
> {
  const snapshot = snapshotOrUndefined(input.root);
  if (!snapshot) return unavailableRefresh(input);
  const active = input.active();
  if (active?.fingerprint === snapshot.fingerprint)
    return unchangedMirror(active);
  await retireActive(input);
  return createFreshMirror(input, snapshot);
}

async function unavailableRefresh(input: {
  active(): ActiveMirror | undefined;
  setActive(value: ActiveMirror | undefined): void;
  terminateOldBackend: () => void | Promise<void>;
}) {
  await retireActive(input);
  return {
    status: "unavailable" as const,
    code: "unsafe_backend_mode" as const,
  };
}

function unchangedMirror(active: ActiveMirror) {
  return {
    status: "ready" as const,
    mirror: active.mirror,
    changed: false,
  };
}

function snapshotOrUndefined(root: ProjectRoot) {
  try {
    return snapshotPythonProject(root);
  } catch {
    return undefined;
  }
}

function createFreshMirror(
  input: {
    root: ProjectRoot;
    setActive(value: ActiveMirror | undefined): void;
    nextGeneration(): number;
  },
  snapshot: ReturnType<typeof snapshotPythonProject>,
) {
  try {
    const mirror = createMirror(input.root, input.nextGeneration(), snapshot);
    input.setActive({
      mirror,
      fingerprint: snapshot.fingerprint,
    });
    return {
      status: "ready" as const,
      mirror,
      changed: true,
    };
  } catch {
    return {
      status: "unavailable" as const,
      code: "unsafe_backend_mode" as const,
    };
  }
}

async function retireActive(input: {
  active(): ActiveMirror | undefined;
  setActive(value: ActiveMirror | undefined): void;
  terminateOldBackend: () => void | Promise<void>;
}): Promise<void> {
  const active = input.active();
  if (!active) return;
  input.setActive(undefined);
  try {
    await active.mirror.disposeAfterShutdown(input.terminateOldBackend);
  } catch {
    // A failed shutdown still removes this generation from publication.
  }
}

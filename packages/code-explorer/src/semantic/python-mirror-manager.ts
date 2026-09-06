import type { ProjectRoot } from "./project-root.js";
import { refreshManager } from "./python-mirror-manager-actions.js";
import type { PythonMirrorApi } from "./python-mirror-runtime-types.js";

export type ActiveMirror = {
  mirror: PythonMirrorApi["mirror"];
  fingerprint: string;
};

export function createPythonMirrorManager(
  root: ProjectRoot,
  terminateOldBackend: () => void | Promise<void> = () => {},
): PythonMirrorApi["manager"] {
  let active: ActiveMirror | undefined;
  let nextGeneration = 0;
  return {
    current: () => active?.mirror,
    refresh: () =>
      refreshManager({
        root,
        active: () => active,
        setActive: (value) => {
          active = value;
        },
        nextGeneration: () => nextGeneration++,
        terminateOldBackend,
      }),
    disposeAfterShutdown: (shutdown) =>
      disposeManager(
        () => active,
        (value) => (active = value),
        shutdown,
      ),
  };
}

async function disposeManager(
  active: () => ActiveMirror | undefined,
  setActive: (value: ActiveMirror | undefined) => void,
  shutdown: () => void | Promise<void>,
): Promise<void> {
  await shutdown();
  active()?.mirror.dispose();
  setActive(undefined);
}

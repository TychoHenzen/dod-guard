import type { ExplorerCoreFactory } from "../../../browser-server/lifecycle.js";
export function shutdownCore(onClose: (signal: AbortSignal) => void) {
  const coreFactory: ExplorerCoreFactory = {
    start: async ({ signal }) => ({ close: async () => onClose(signal) }),
  };
  return coreFactory;
}

import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { BrowserServer } from "./browser-server.js";
import type { ExplorerCore } from "./explorer-core.js";
import type { HttpListener } from "./http-listener.js";

export function closeResources(options: {
  listener: HttpListener | undefined;
  core: ExplorerCore | undefined;
  controller: AbortController;
  parentSignal: AbortSignal | undefined;
  abort: () => void;
}): Promise<void> {
  const { listener, core, controller, parentSignal, abort } = options;
  listener?.stopAdmission();
  controller.abort();
  const timeout = AbortSignal.timeout(10_000);
  return Promise.allSettled([
    listener?.close(timeout),
    core?.close(timeout),
  ]).then(() => {
    parentSignal?.removeEventListener("abort", abort);
  });
}

export function serverResult(options: {
  listener: HttpListener;
  core: ExplorerCore;
  projectRoot: ProjectRoot;
  close: () => Promise<void>;
}): BrowserServer {
  const { listener, projectRoot, close } = options;
  return { url: listener.address, projectRoot, close };
}

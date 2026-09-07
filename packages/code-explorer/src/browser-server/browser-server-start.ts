import type { BrowserServer } from "./browser-server.js";
import { runBrowserServer } from "./browser-server-run.js";
import {
  projectRootFor,
  type StartOptions,
} from "./browser-server-start-support.js";

export async function startBrowserServer(
  options: StartOptions,
): Promise<BrowserServer> {
  const controller = new AbortController();
  const parentSignal = options.signal;
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  const projectRoot = projectRootFor(options.project_root);
  return runBrowserServer({
    start: options,
    projectRoot,
    controller,
    parentSignal,
    abort,
  });
}

import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { BrowserServer } from "./browser-server.js";
import {
  closeResources,
  serverResult,
} from "./browser-server-lifecycle-support.js";
import {
  listenForPort,
  openBrowser,
  type StartOptions,
} from "./browser-server-start-support.js";
import type { ExplorerCore } from "./explorer-core.js";
import type { HttpListener } from "./http-listener.js";

type ServerResources = {
  core: ExplorerCore | undefined;
  listener: HttpListener | undefined;
};

export async function runBrowserServer(options: {
  start: StartOptions;
  projectRoot: ProjectRoot;
  controller: AbortController;
  parentSignal: AbortSignal | undefined;
  abort: () => void;
}): Promise<BrowserServer> {
  const resources: ServerResources = { core: undefined, listener: undefined };
  try {
    return await startBrowserServerRun(options, resources);
  } catch (error) {
    await closeResources({
      ...resources,
      controller: options.controller,
      parentSignal: options.parentSignal,
      abort: options.abort,
    });
    throw error;
  }
}

async function startBrowserServerRun(
  options: {
    start: StartOptions;
    projectRoot: ProjectRoot;
    controller: AbortController;
    parentSignal: AbortSignal | undefined;
    abort: () => void;
  },
  resources: ServerResources,
): Promise<BrowserServer> {
  const startedCore = await options.start.coreFactory.start({
    projectRoot: options.projectRoot,
    signal: options.controller.signal,
  });
  resources.core = startedCore;
  const listener = await listenForPort(
    options.start,
    options.controller.signal,
    startedCore,
  );
  resources.listener = listener;
  options.start.write?.(`Code Explorer: ${listener.address.href}`);
  await openBrowser(options.start, listener, options.controller.signal);
  return serverResult({
    listener,
    core: startedCore,
    projectRoot: options.projectRoot,
    close: createServerClose(options, resources),
  });
}

function createServerClose(
  options: {
    controller: AbortController;
    parentSignal: AbortSignal | undefined;
    abort: () => void;
  },
  resources: ServerResources,
): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () =>
    (closing ??= closeResources({
      ...resources,
      controller: options.controller,
      parentSignal: options.parentSignal,
      abort: options.abort,
    }));
}

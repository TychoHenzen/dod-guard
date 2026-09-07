import {
  createNativeProjectRoot,
  ProjectPathError,
  type ProjectRoot,
} from "../semantic/api/public-api.js";
import type { BrowserOpener } from "./browser-opener.js";
import { BrowserServerError } from "./browser-server-error.js";
import type { ExplorerCore } from "./explorer-core.js";
import type { ExplorerCoreFactory } from "./explorer-core-factory.js";
import type { HttpListener } from "./http-listener.js";
import type { PortBinder } from "./port-binder.js";

export type StartOptions = {
  project_root: string;
  no_open: boolean;
  coreFactory: ExplorerCoreFactory;
  binder: PortBinder;
  opener: BrowserOpener;
  signal?: AbortSignal;
  write?: (line: string) => void;
  writeError?: (line: string) => void;
};

const firstPort = 4410;
const lastPort = 4429;

export function projectRootFor(path: string): ProjectRoot {
  try {
    return createNativeProjectRoot(path);
  } catch (error) {
    if (error instanceof ProjectPathError)
      throw new BrowserServerError("invalid_project_root");
    throw error;
  }
}

export async function listenForPort(
  options: StartOptions,
  signal: AbortSignal,
  core: ExplorerCore,
): Promise<HttpListener> {
  for (let port = firstPort; port <= lastPort; port += 1) {
    try {
      return await options.binder.listen("127.0.0.1", port, signal, core);
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
    }
  }
  throw new BrowserServerError("browser_port_unavailable");
}

function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "EADDRINUSE"
  );
}

export async function openBrowser(
  options: StartOptions,
  listener: HttpListener,
  signal: AbortSignal,
): Promise<void> {
  if (options.no_open) return;
  try {
    await options.opener.open(listener.address, signal);
  } catch {
    options.writeError?.("browser_open_failed");
  }
}

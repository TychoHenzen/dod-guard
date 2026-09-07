import { startEmbeddedBrowserRuntime } from "./browser-server/embedded-runtime.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  nativeBrowserOpener,
  nativePortBinder,
  parseServeArguments,
  startBrowserServer,
} from "./browser-server/lifecycle.js";
import { browserAssetRoot } from "./package-info.js";
import { createRuntimeCoreFactory, createRuntimeServer } from "./runtime-core.js";
import {
  createNativeProjectRoot,
  createStartedRuntimeAdapters,
  loadAdapterSelectionRecord,
  ProjectPathError,
} from "./semantic/api/public-api.js";

export async function createEmbeddedBrowserRuntime(options: {
  project_root: string;
  origin: string;
  signal?: AbortSignal;
  core_factory?: import("./browser-server/lifecycle.js").ExplorerCoreFactory;
}) {
  return startEmbeddedBrowserRuntime({
    projectRoot: options.project_root,
    origin: options.origin,
    signal: options.signal,
    assetRoot: browserAssetRoot,
    coreFactory: options.core_factory ?? createRuntimeCoreFactory(),
  });
}

export async function runMain(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_[0] === "serve") {
    const parsed = parseServeArguments(arguments_);
    const service = await startBrowserServer({
      ...parsed,
      coreFactory: createRuntimeCoreFactory(),
      binder: nativePortBinder,
      opener: nativeBrowserOpener,
      write: (line) => process.stdout.write(`${line}\n`),
      writeError: (line) => process.stderr.write(`${line}\n`),
    });
    const shutdown = () => void service.close().then(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }
  loadAdapterSelectionRecord();
  const projectRoot = createNativeProjectRoot(parseProjectRootArgument(arguments_));
  const adapters = await createStartedRuntimeAdapters(projectRoot);
  const server = createRuntimeServer(projectRoot, adapters);
  const transport = new StdioServerTransport();
  let shuttingDown: Promise<void> | undefined;
  const shutdownBackends = () => {
    shuttingDown ??= Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.())).then(() => undefined);
    return shuttingDown;
  };
  const closeServer = () => void server.close().then(shutdownBackends);
  transport.onclose = closeServer;
  process.stdin.once("end", closeServer);
  await server.mcp.connect(transport);
}

function parseProjectRootArgument(arguments_: readonly string[]): string | undefined {
  if (arguments_.length === 0) return undefined;
  if (arguments_.length === 2 && arguments_[0] === "--project-root" && arguments_[1].length > 0) return arguments_[1];
  throw new ProjectPathError("invalid_project_root", "project_root");
}

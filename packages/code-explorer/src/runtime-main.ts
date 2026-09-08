import process from "node:process";
import * as stdio from "@modelcontextprotocol/sdk/server/stdio.js";
import * as embeddedRuntime from "./browser-server/embedded-runtime.js";
import {
  nativeBrowserOpener,
  nativePortBinder,
  parseServeArguments,
  startBrowserServer,
} from "./browser-server/lifecycle.js";
import { browserAssetRoot } from "./package-info.js";
import { createRuntimeCoreFactory } from "./runtime-core.js";
import {
  createNativeProjectRoot,
  ProjectPathError,
} from "./semantic/api/public-api.js";

const { startEmbeddedBrowserRuntime } = embeddedRuntime;
const { StdioServerTransport } = stdio;

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
  const projectRoot = createNativeProjectRoot(
    parseProjectRootArgument(arguments_),
  );
  const controller = new AbortController();
  const core = await createRuntimeCoreFactory().start({
    projectRoot,
    signal: controller.signal,
  });
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const close = () => {
    controller.abort();
    closing ??= core.close(AbortSignal.timeout(10_000));
    return closing;
  };
  transport.onclose = () => void close();
  process.stdin.once("end", () => void close());
  try {
    if (!core.connect) throw new Error("runtime_core_transport_unavailable");
    await core.connect(transport);
  } catch (error) {
    await close();
    throw error;
  }
}

function parseProjectRootArgument(
  arguments_: readonly string[],
): string | undefined {
  if (arguments_.length === 0) return;
  if (
    arguments_.length === 2 &&
    arguments_[0] === "--project-root" &&
    arguments_[1].length > 0
  )
    return arguments_[1];
  throw new ProjectPathError("invalid_project_root", "project_root");
}

import type { InjectedSemanticBackend } from "../adapters/language-adapter.js";
import type { BackendLaunchPolicy } from "../backend-launch/backend-launch-policy.js";
import type {
  RelationCapabilities,
  SemanticRequest,
} from "../contracts/contract.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import { createPythonMirrorManager } from "../python-mirror/python-mirror-runtime.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";
import {
  createPythonBuild,
  createPythonShutdown,
} from "./runtime-python-backend-lifecycle.js";
import type { PythonBuildInput } from "./runtime-python-backend-types.js";
export function createManagedPythonBackend(
  ...input: [
    ProjectRoot,
    BackendLaunchPolicy,
    RelationCapabilities,
    PythonBuildInput["options"]?,
  ]
) {
  const [
    projectRoot,
    policy,
    capabilities,
    options = {
      symbols: new Map(),
    },
  ] = input;
  const context = createPythonContext({
    projectRoot,
    policy,
    capabilities,
    options,
  });
  return createManagedBackend(context);
}
function createPythonContext(
  input: Omit<
    PythonBuildInput,
    "manager" | "getInner" | "setInner" | "getState" | "setState"
  >,
): PythonBuildInput {
  let inner: ReturnType<typeof createRuntimeLspBackend> | undefined;
  let state: ReturnType<InjectedSemanticBackend["readiness"]> = {
    state: "initializing",
  };
  const manager = createPythonMirrorManager(input.projectRoot, async () => {
    await inner?.shutdown?.();
    inner = undefined;
  });
  return {
    ...input,
    manager,
    getInner: () => inner,
    setInner: (value) => {
      inner = value;
    },
    getState: () => state,
    setState: (value) => {
      state = value;
    },
  };
}

function createManagedBackend(context: PythonBuildInput) {
  const build = createPythonBuild(context);
  return {
    readiness: () => context.getInner()?.readiness() ?? context.getState(),
    capabilities: () =>
      context.getInner()?.capabilities?.() ?? context.capabilities,
    start: build,
    refresh: build,
    shutdown: createPythonShutdown(
      context.manager,
      context.getInner,
      context.setInner,
      context.setState,
    ),
    query: (request: SemanticRequest) => queryPython(context, build, request),
  };
}

async function queryPython(
  context: PythonBuildInput,
  build: () => Promise<void>,
  request: SemanticRequest,
): Promise<
  Awaited<ReturnType<ReturnType<typeof createRuntimeLspBackend>["query"]>>
> {
  await build();
  const inner = context.getInner();
  if (!inner) throw new Error("backend_unavailable");
  return inner.query(request);
}

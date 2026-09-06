import {
  createRuntimeLaunchPolicy,
  loadAdapterSelectionRecord,
} from "../adapter-selection/adapter-selection.js";
import type { RelationCapabilities } from "../contracts/contract.js";
import { createFilteredWorkspace } from "../workspace/filtered-workspace.js";
import type { LanguageAdapter } from "../adapters/language-adapter.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import type { RuntimeAdapterInput } from "./runtime-adapter-input.js";
import { runtimeAdapterMetadata } from "./runtime-adapter-metadata.js";
import {
  createSelectedAdapter,
  withFilteredShutdown,
} from "./runtime-adapter-selection.js";
import { unavailableBackend } from "./runtime-backend-unavailable.js";
import { createNativeRuntimeBackend } from "./runtime-native-backend.js";

export function createNativeRuntimeAdapter(
  input: RuntimeAdapterInput,
): LanguageAdapter {
  const prepared = input.policy.prepare(input.backend.language);
  const filtered = createFilteredBackend(input, prepared);
  const backend = createNativeBackend(input, prepared, filtered);
  return wrapNativeAdapter({
    input,
    prepared,
    filtered,
    backend,
  });
}

function createFilteredBackend(
  input: Parameters<typeof createNativeRuntimeAdapter>[0],
  prepared: ReturnType<typeof input.policy.prepare>,
) {
  return prepared.status === "ready"
    ? createFilteredWorkspace(input.projectRoot)
    : undefined;
}

function createNativeBackend(
  input: Parameters<typeof createNativeRuntimeAdapter>[0],
  prepared: ReturnType<typeof input.policy.prepare>,
  filtered: ReturnType<typeof createFilteredBackend>,
) {
  if (prepared.status !== "ready") return unavailableBackend;
  return createNativeRuntimeBackend({
    backend: input.backend,
    policy: input.policy,
    capabilities: input.capabilities,
    root: filtered?.root ?? input.projectRoot,
    filtered,
  });
}

function wrapNativeAdapter(context: {
  input: Parameters<typeof createNativeRuntimeAdapter>[0];
  prepared: ReturnType<
    Parameters<typeof createNativeRuntimeAdapter>[0]["policy"]["prepare"]
  >;
  filtered: ReturnType<typeof createFilteredBackend>;
  backend: typeof unavailableBackend;
}): LanguageAdapter {
  const { input, prepared, filtered, backend } = context;
  const adapter = createSelectedAdapter(input.backend.language, {
    backend,
    compatible: true,
    ...runtimeAdapterMetadata({
      backendName: input.backend.platform_executables[input.platform],
      prepared,
      capabilities: input.capabilities,
    }),
  });
  return filtered ? withFilteredShutdown(adapter, filtered) : adapter;
}

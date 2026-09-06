import type { RelationCapabilities } from "../contracts/contract.js";
import {
  createPythonAdapter,
  type LanguageAdapter,
  type LanguageAdapterOptions,
} from "../adapters/language-adapter.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import type { RuntimeAdapterInput } from "./runtime-adapter-input.js";
import { runtimeAdapterMetadata } from "./runtime-adapter-metadata.js";
import { unavailableBackend } from "./runtime-backend-unavailable.js";
import { createManagedPythonBackend } from "./runtime-python-backend.js";

export function createPythonRuntimeAdapter(
  input: RuntimeAdapterInput,
): LanguageAdapter {
  const prepared = input.policy.prepare("python");
  return createPythonAdapter(createPythonAdapterOptions(input, prepared));
}

function createPythonAdapterOptions(
  input: Parameters<typeof createPythonRuntimeAdapter>[0],
  prepared: ReturnType<typeof input.policy.prepare>,
): LanguageAdapterOptions {
  return {
    backend:
      prepared.status === "ready"
        ? createManagedPythonBackend(
            input.projectRoot,
            input.policy,
            input.capabilities,
          )
        : unavailableBackend,
    compatible: true,
    ...runtimeAdapterMetadata({
      backendName: input.backend.platform_executables[input.platform],
      prepared,
      capabilities: input.capabilities,
    }),
  };
}

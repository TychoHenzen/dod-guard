import {
  createRuntimeLaunchPolicy,
  loadAdapterSelectionRecord,
  resolveTrustedCommandRoots,
} from "../adapter-selection/adapter-selection.js";
import { createNativeBackendInspector } from "../adapters/index.js";
import type { LanguageAdapter } from "../adapters/language-adapter.js";
import type { RelationCapabilities } from "../contracts/contract.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import type * as adapterInput from "./runtime-adapter-record-input.js";
import { createNativeRuntimeAdapter } from "./runtime-native-adapter.js";
import { createPythonRuntimeAdapter } from "./runtime-python-adapter.js";

export function createRuntimeAdapters(
  projectRoot: ProjectRoot,
): readonly LanguageAdapter[] {
  const record = loadAdapterSelectionRecord();
  const platform = process.platform === "win32" ? "win32" : "posix";
  const policy = createRuntimeLaunchPolicy(
    {
      project_root: projectRoot.canonicalPath,
      platform,
      inspect: createNativeBackendInspector(
        trustedRoots(record, platform),
        projectRoot.canonicalPath,
      ),
    },
    record,
  );
  return record.runtime_backends.map((backend) =>
    createAdapter({
      backend,
      projectRoot,
      platform,
      policy,
    }),
  );
}

function trustedRoots(
  record: ReturnType<typeof loadAdapterSelectionRecord>,
  platform: "win32" | "posix",
): readonly string[] {
  return platform === "win32"
    ? resolveTrustedCommandRoots(record.trusted_command_roots.win32)
    : ["/opt/code-explorer/backends"];
}

function createAdapter(
  input: adapterInput.RuntimeAdapterRecordInput,
): LanguageAdapter {
  const capabilities = backendCapabilities(input.backend.capabilities);
  return input.backend.language === "python"
    ? createPythonRuntimeAdapter({ ...input, capabilities })
    : createNativeRuntimeAdapter({
        ...input,
        capabilities,
      });
}

function backendCapabilities(
  capabilities: Record<string, string>,
): RelationCapabilities {
  return Object.fromEntries(
    Object.entries(capabilities).map(([name, state]) => [name, { state }]),
  ) as RelationCapabilities;
}

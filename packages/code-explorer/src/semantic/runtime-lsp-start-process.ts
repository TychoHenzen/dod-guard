import type { SymbolIdentity } from "./contract.js";
import { createDirectLspClient } from "./direct-lsp.js";
import { createDirectLspSemanticBackend } from "./direct-lsp-semantic.js";
import { spawnNativeLspProcess } from "./native-lsp-process.js";
import type { RuntimeLspState } from "./runtime-lsp-state.js";

export async function startRuntimeProcess(
  lifecycle: RuntimeLspState,
): Promise<void> {
  const preparation = requirePreparation(lifecycle);
  lifecycle.client = createClient(lifecycle);
  await lifecycle.client.start(spawnProcess(lifecycle, preparation));
  openInitialDocuments(lifecycle);
  lifecycle.inner = createDirectLspSemanticBackend({
    ...lifecycle.options,
    client: lifecycle.client,
    discovery_document_paths: lifecycle.options.initial_document_paths,
  });
}

function requirePreparation(lifecycle: RuntimeLspState) {
  const preparation = lifecycle.options.prepare();
  if (preparation.status === "ready") return preparation;
  lifecycle.state = {
    state: "unavailable",
    failure_code: preparation.code,
  };
  throw new Error(preparation.code);
}

function createClient(lifecycle: RuntimeLspState) {
  return createDirectLspClient({
    language: lifecycle.options.language,
    root_uri: lifecycle.options.root_uri,
    capabilities: {},
    safe_initialization_options: lifecycle.options.safe_initialization_options,
    scheduler: lifecycle.options.scheduler,
    afterInitialize: () => lifecycle.options.confirmInitialized(),
    restart: () => replacementProcess(lifecycle),
  });
}

function replacementProcess(lifecycle: RuntimeLspState) {
  const preparation = lifecycle.options.prepare();
  return preparation.status === "ready"
    ? spawnProcess(lifecycle, preparation)
    : undefined;
}

function spawnProcess(
  lifecycle: RuntimeLspState,
  preparation: {
    executable: string;
    arguments: readonly string[];
    environment: Readonly<Record<string, string>>;
  },
) {
  return (lifecycle.options.spawn ?? spawnNativeLspProcess)(
    preparation.executable,
    preparation.arguments,
    preparation.environment,
  );
}

function openInitialDocuments(lifecycle: RuntimeLspState): void {
  for (const path of lifecycle.options.initial_document_paths ?? []) {
    const document = lifecycle.options.root.protectedRead(path);
    lifecycle.client?.openProtectedDocument?.(
      lifecycle.options.toBackendUri(initialDocumentLocation(path)),
      {
        language_id: lifecycle.options.language,
        bytes: document.bytes,
      },
    );
  }
}

function initialDocumentLocation(path: string): SymbolIdentity["location"] {
  return {
    path,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  };
}

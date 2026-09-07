import {
  createCSharpAdapter,
  createPythonAdapter,
  createRustAdapter,
  type LanguageAdapter,
  type LanguageAdapterOptions,
} from "../adapters/language-adapter.js";
import type { createFilteredWorkspace } from "../workspace/index.js";

export function createSelectedAdapter(
  language: string,
  options: LanguageAdapterOptions,
): LanguageAdapter {
  if (language === "rust") return createRustAdapter(options);
  if (language === "python") return createPythonAdapter(options);
  return createCSharpAdapter(options);
}

export function withFilteredShutdown(
  adapter: LanguageAdapter,
  filtered: ReturnType<typeof createFilteredWorkspace>,
): LanguageAdapter {
  return {
    ...adapter,
    shutdown: () => shutdownFiltered(adapter, filtered),
  };
}

async function shutdownFiltered(
  adapter: LanguageAdapter,
  filtered: ReturnType<typeof createFilteredWorkspace>,
): Promise<void> {
  try {
    await adapter.shutdown?.();
  } finally {
    filtered.dispose();
  }
}

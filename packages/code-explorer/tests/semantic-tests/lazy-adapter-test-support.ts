import type { LanguageAdapter } from "../../src/semantic/adapters/language-adapter.js";
import { configuredCapabilities } from "../../src/semantic/adapters/language-adapter-status.js";
import { createLazyRuntimeAdapter } from "../../src/semantic/runtime/runtime-lazy-adapter.js";

/** A lazy rust adapter whose language is present, so start runs `build`. */
export function presentRustAdapter(
  build: () => LanguageAdapter,
): LanguageAdapter {
  return createLazyRuntimeAdapter({
    language: "rust",
    backendName: "rust-analyzer",
    capabilities: configuredCapabilities(undefined),
    isPresent: async () => true,
    build,
  });
}

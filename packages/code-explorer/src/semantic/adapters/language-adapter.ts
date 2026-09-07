import { createLanguageAdapter } from "./language-adapter-factory.js";
import type { LanguageAdapterOptions } from "./language-adapter-options.js";

export type { InjectedSemanticBackend } from "./injected-semantic-backend.js";
export type { LanguageAdapterOptions } from "./language-adapter-options.js";
export type { LanguageAdapter } from "./language-adapter-type.js";

export function createRustAdapter(
  options: LanguageAdapterOptions,
): import("./language-adapter-type.js").LanguageAdapter {
  return createLanguageAdapter("rust", options);
}

export function createPythonAdapter(
  options: LanguageAdapterOptions,
): import("./language-adapter-type.js").LanguageAdapter {
  return createLanguageAdapter("python", options);
}

export function createCSharpAdapter(
  options: LanguageAdapterOptions,
): import("./language-adapter-type.js").LanguageAdapter {
  return createLanguageAdapter("csharp", options);
}

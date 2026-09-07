import type { LanguageAdapter } from "../semantic/adapters/language-adapter.js";
import type { ProjectRoot } from "../semantic/project-root/project-root.js";

export function root(
  revalidate: () => "ready" | "inaccessible" | "unavailable",
): ProjectRoot {
  return {
    canonicalPath: "/private/project",
    revalidate,
    resolveClientPath: () => "",
    classifyBackendPath: () => ({ external: true }),
    openProtected: () => {
      throw new Error("unused");
    },
    protectedRead: () => {
      throw new Error("unused");
    },
  };
}

export function adapter(calls: string[]): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "fixture",
      backend_version: "1",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" },
        references: { state: "ready" },
        type_definition: { state: "ready" },
        implementation: { state: "ready" },
        callers: { state: "ready" },
        callees: { state: "ready" },
      },
      last_transition_time: 0,
    }),
    request: async () => {
      throw new Error("unused");
    },
    shutdown: async () => {
      calls.push("stop");
    },
    start: async () => {
      calls.push("start");
    },
  };
}

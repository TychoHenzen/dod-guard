import type { LanguageAdapter } from "../../semantic/adapters/language-adapter.js";
import type { ProjectRoot } from "../../semantic/project-root/project-root.js";
import { readyAdapterStatus } from "../navigation/support/adapter-status.js";

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
    status: () => readyAdapterStatus({ name: "fixture", version: "1" }),
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

export const runtimeRoot = {
  canonicalPath: "/project",
  resolveClientPath: () => "/project/a.rs",
  classifyBackendPath: () => ({ relative_path: "a.rs" }),
  openProtected: () => ({ path: "/project/a.rs", handle: undefined }),
  protectedRead: () => ({ path: "/project/a.rs", bytes: "" }),
} as never;

export const unavailableCapabilities = {
  definition: { state: "unavailable" },
  references: { state: "unavailable" },
  type_definition: { state: "unavailable" },
  implementation: { state: "unavailable" },
  callers: { state: "unavailable" },
  callees: { state: "unavailable" },
} as never;

export function readyPreparation() {
  return {
    status: "ready" as const,
    executable: "server",
    version: "test",
    arguments: [],
    shell: false as const,
    environment: {},
    endpoint: "stdio" as const,
    safe_initialization_options: {},
  };
}

import type { ProjectRoot } from "../../../semantic/api/public-api.js";

export function unavailableProjectRoot(directory: string) {
  const unavailableRoot: ProjectRoot = {
    canonicalPath: directory,
    revalidate: () => "unavailable",
    resolveClientPath: () => "",
    classifyBackendPath: () => ({ external: true }),
    openProtected: () => {
      throw new Error("unused");
    },
    protectedRead: () => {
      throw new Error("unused");
    },
  };
  return { unavailableRoot };
}

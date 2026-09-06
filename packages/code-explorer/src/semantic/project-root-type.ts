import type { ProtectedPath } from "./project-root-protected-path.js";

export type ProjectRoot<Handle = unknown> = {
  canonicalPath: string;
  revalidate: () => "ready" | "inaccessible" | "unavailable";
  resolveClientPath: (relativePath: string) => string;
  classifyBackendPath: (
    candidate: string,
  ) => { relative_path: string } | { external: true };
  openProtected: (relativePath: string) => ProtectedPath<Handle>;
  protectedRead: (relativePath: string) => {
    path: string;
    bytes: string;
  };
};

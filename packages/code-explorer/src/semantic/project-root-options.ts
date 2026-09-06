import type { ProjectFilesystem } from "./project-root-filesystem.js";

export type ProjectRootOptions<Handle = unknown> = {
  cwd: string;
  projectRoot?: string;
  filesystem: ProjectFilesystem<Handle>;
  platform: "win32" | "posix";
};

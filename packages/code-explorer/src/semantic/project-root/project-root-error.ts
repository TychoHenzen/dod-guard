import type { ProjectPathErrorCode } from "./project-root-error-code.js";

export class ProjectPathError extends Error {
  constructor(
    readonly code: ProjectPathErrorCode,
    readonly root_source?: "cwd" | "project_root",
  ) {
    super(code);
  }
}

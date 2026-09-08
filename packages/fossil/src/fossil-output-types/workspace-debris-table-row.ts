import type { WorkspaceDebrisFinding } from "../types.js";

export type WorkspaceDebrisTableRow =
  | { readonly kind: "finding"; readonly finding: WorkspaceDebrisFinding }
  | { readonly kind: "ignored-directory-summary"; readonly directory: string; readonly count: number };

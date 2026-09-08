export interface AnalysisWarning {
  readonly code:
    | "empty_repository"
    | "future_commit"
    | "shallow_history"
    | "sparse_checkout"
    | "submodule_omitted"
    | "reference_unreadable"
    | "reference_outside_boundary"
    | "reference_path_changed"
    | "reference_content_limit"
    | "reference_binary"
    | "workspace_unreadable"
    | "workspace_omitted"
    | "incomplete_reference";
  readonly message: string;
  readonly path?: string;
}

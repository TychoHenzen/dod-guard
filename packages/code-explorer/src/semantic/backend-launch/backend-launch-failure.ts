export type BackendLaunchFailure =
  | "backend_unavailable"
  | "unsafe_backend_mode"
  | "backend_identity_unverifiable"
  | "backend_identity_changed"
  | "unsupported_backend_version"
  | "backend_endpoint_rejected";

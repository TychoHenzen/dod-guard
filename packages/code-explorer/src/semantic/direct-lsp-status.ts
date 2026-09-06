export type DirectLspStatus = {
  state: "initializing" | "ready" | "failed" | "unavailable";
  events: readonly (
    | "backend_capability_rejected"
    | "backend_write_rejected"
    | "backend_notification"
  )[];
  restart_delays_ms: readonly number[];
  server_capabilities?: Readonly<Record<string, unknown>>;
};

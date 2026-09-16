export type FakeAdapterReadiness =
  | { state: "ready" }
  | { state: "unavailable" }
  | { state: "failed"; failure_code: string };

export type SessionResult<T> =
  | { state: "ok"; response: Promise<T> }
  | { state: "invalid_session" | "request_id_conflict" | "project_capacity" };

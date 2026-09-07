export const invalidReply = {
  schema_version: 1,
  code: "invalid_request",
  message: "invalid_request",
  retryable: false,
};
export const statusReplies = {
  start_session: {
    schema_version: 1,
    state: "ready",
    data: { session_id: "core-session" },
  },
  status: { schema_version: 1, state: "ready", data: {} },
};

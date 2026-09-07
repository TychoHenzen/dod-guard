export function withBrowserSession(
  reply: Record<string, unknown>,
  browserSessionId: string,
): Record<string, unknown> {
  const replyData =
    typeof reply.data === "object" &&
    reply.data !== null &&
    !(reply.data instanceof Array)
      ? (reply.data as Record<string, unknown>)
      : {};
  return {
    ...reply,
    data: { ...replyData, browser_session_id: browserSessionId },
  };
}

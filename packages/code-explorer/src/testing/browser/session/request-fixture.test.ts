export function sessionRequests(prefix: string, restoreState: string) {
  const requests: Array<{
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  const request = async (
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) => {
    requests.push({ body, headers });
    if (body.action === "restore") return { state: restoreState };
    return {
      state: "created",
      data: { browser_session_id: `${prefix}-server` },
    };
  };
  return { request, requests };
}

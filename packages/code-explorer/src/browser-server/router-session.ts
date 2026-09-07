import type { BrowserHttpResponse } from "./browser-http-response.js";
import { withBrowserSession } from "./browser-session-reply.js";
import type { BrowserRouterContext } from "./router-context.js";
import { browserError, errorStatus, json } from "./router-policy.js";
import {
  acceptBrowserSession,
  idleMilliseconds,
} from "./router-session-acceptance.js";

function sweepExpiredSessions(context: BrowserRouterContext): void {
  const now = context.now();
  for (const [browserSessionId, session] of context.sessions) {
    if (now - session.lastAcceptedAt >= idleMilliseconds)
      context.sessions.delete(browserSessionId);
  }
}

export async function session(
  context: BrowserRouterContext,
  body: Record<string, unknown>,
  headers: Record<string, string | undefined>,
): Promise<BrowserHttpResponse> {
  const tabId = body.tab_instance_id as string;
  if (headers["x-code-explorer-tab"] !== tabId)
    return json(403, browserError("invalid_browser_session"));
  if (body.action === "create") return createSession(context, tabId, headers);
  return restoreSession(context, tabId, headers);
}

async function createSession(
  context: BrowserRouterContext,
  tabId: string,
  headers: Record<string, string | undefined>,
): Promise<BrowserHttpResponse> {
  sweepExpiredSessions(context);
  if (
    headers["x-code-explorer-session"] ||
    context.sessions.size >= context.maxSessions
  )
    return json(429, browserError("project_capacity", true));
  const reply = await context.options.call("code_status", {
    action: "start_session",
  });
  if ("code" in reply) return json(errorStatus(String(reply.code)), reply);
  const coreSessionId = (reply.data as Record<string, unknown> | undefined)
    ?.session_id;
  if (typeof coreSessionId !== "string")
    return json(500, browserError("internal_error"));
  const browserSessionId = crypto.randomUUID();
  context.sessions.set(browserSessionId, {
    coreSessionId,
    tabId,
    lastAcceptedAt: context.now(),
  });
  return json(200, withBrowserSession(reply, browserSessionId));
}

function restoreSession(
  context: BrowserRouterContext,
  tabId: string,
  headers: Record<string, string | undefined>,
): BrowserHttpResponse {
  const current = restoreCandidate(context, tabId, headers);
  if (!current) return json(403, browserError("invalid_browser_session"));
  const expired = acceptBrowserSession(context, current.id, current.session);
  if (expired) return expired;
  return json(200, {
    schema_version: 1,
    project_id: "project",
    project_generation: 0,
    pending_generation: null,
    state: "restored",
    data: {},
  });
}

function restoreCandidate(
  context: BrowserRouterContext,
  tabId: string,
  headers: Record<string, string | undefined>,
):
  | { id: string; session: { tabId: string; lastAcceptedAt: number } }
  | undefined {
  const id = headers["x-code-explorer-session"];
  const session = id ? context.sessions.get(id) : undefined;
  if (!(id && session) || session.tabId !== tabId) return undefined;
  return { id, session };
}

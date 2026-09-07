import type { BrowserHttpResponse } from "./browser-http-response.js";
import type { BrowserSession } from "./browser-session.js";
import type { BrowserRouterContext } from "./router-context.js";
import { browserError, errorStatus, json, routes } from "./router-policy.js";
import { acceptBrowserSession } from "./router-session-acceptance.js";

function sessionForNavigation(
  context: BrowserRouterContext,
  headers: Record<string, string | undefined>,
): { id: string; session: BrowserSession } | undefined {
  const id = headers["x-code-explorer-session"];
  const tabId = headers["x-code-explorer-tab"];
  const session = id ? context.sessions.get(id) : undefined;
  if (!(id && session) || session.tabId !== tabId) return undefined;
  return { id, session };
}

export async function navigation(options: {
  context: BrowserRouterContext;
  route: string;
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
}): Promise<BrowserHttpResponse> {
  const { context, route, body, headers } = options;
  const current = sessionForNavigation(context, headers);
  if (!current) return json(403, browserError("invalid_browser_session"));
  const expired = acceptBrowserSession(context, current.id, current.session);
  if (expired) return expired;
  const coreArguments = navigationArguments(
    route,
    body,
    current.session.coreSessionId,
  );
  const reply = await context.options.call(routes[route], coreArguments);
  return json("code" in reply ? errorStatus(String(reply.code)) : 200, reply);
}

function navigationArguments(
  route: string,
  body: Record<string, unknown>,
  sessionId: string,
): Record<string, unknown> {
  if (route === "/api/search")
    return Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== "request_id"),
    );
  if (route === "/api/status" && body.action === "status") return body;
  return { ...body, session_id: sessionId };
}

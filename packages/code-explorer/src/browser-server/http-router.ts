import { statSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export type BrowserCoreReply = Record<string, unknown>;
export type BrowserCoreCall = (name: string, arguments_: Record<string, unknown>) => Promise<BrowserCoreReply>;
export type BrowserHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: Buffer;
};
export type BrowserHttpResponse = { status: number; headers: Record<string, string>; body: string };
export type MonotonicClock = { nowMilliseconds(): number };

type BrowserSession = { coreSessionId: string; tabId: string; lastAcceptedAt: number };

const maxBodyBytes = 64 * 1024;
const maxResponseBytes = 1024 * 1024;
const idleMilliseconds = 30 * 60 * 1000;
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const routes: Record<string, string> = {
  "/api/search": "code_search",
  "/api/focus": "code_focus",
  "/api/follow": "code_follow",
  "/api/history": "code_history",
  "/api/status": "code_status",
};

function browserError(code: string, retryable = false): BrowserCoreReply {
  return { schema_version: 1, code, message: code, retryable };
}

function errorStatus(code: string): number {
  if (code === "invalid_browser_origin" || code === "invalid_browser_session") return 403;
  if (code === "route_not_found") return 404;
  if (code === "method_not_allowed") return 405;
  if (code === "browser_session_expired") return 410;
  if (code === "resource_limit") return 413;
  if (code === "project_capacity" || code === "http_capacity") return 429;
  if (code === "workspace_unavailable" || code.startsWith("backend_")) return 503;
  return 400;
}

function json(status: number, payload: BrowserCoreReply): BrowserHttpResponse {
  const body = JSON.stringify(payload);
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": csp,
    },
    body,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  body: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((key) => key in body) &&
    Object.keys(body).every((key) => required.includes(key) || optional.includes(key))
  );
}

function validBody(route: string, body: Record<string, unknown>): boolean {
  if (route === "/api/session") {
    return (
      typeof body.tab_instance_id === "string" &&
      ((body.action === "create" &&
        body.document_start === "new" &&
        exactKeys(body, ["action", "tab_instance_id", "document_start"])) ||
        (body.action === "restore" &&
          body.document_start === "reload" &&
          exactKeys(body, ["action", "tab_instance_id", "document_start"])))
    );
  }
  if (route === "/api/status") {
    return (
      (body.action === "status" && exactKeys(body, ["action"])) ||
      (body.action === "refresh" && typeof body.request_id === "string" && exactKeys(body, ["action", "request_id"]))
    );
  }
  const required: Record<string, readonly string[]> = {
    "/api/search": ["request_id", "query"],
    "/api/focus": ["request_id", "symbol_id"],
    "/api/follow": ["request_id", "view_id", "handle", "relation"],
    "/api/history": ["request_id", "action"],
  };
  const optional: Record<string, readonly string[]> = {
    "/api/search": ["path_globs", "languages", "kinds", "content", "include_generated", "limit"],
    "/api/focus": ["body_limit_bytes"],
    "/api/follow": ["limit"],
    "/api/history": ["limit"],
  };
  return required[route] !== undefined && exactKeys(body, required[route], optional[route]);
}

export class BrowserHttpRouter {
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly maxSessions: number;
  private readonly maxInFlight: number;
  private readonly now: () => number;
  private active = 0;

  constructor(
    private readonly options: {
      origin: string;
      call: BrowserCoreCall;
      maxSessions?: number;
      maxInFlight?: number;
      clock?: MonotonicClock;
      assetRoot?: string;
    },
  ) {
    this.maxSessions = options.maxSessions ?? 8;
    this.maxInFlight = options.maxInFlight ?? 8;
    this.now = () => options.clock?.nowMilliseconds() ?? performance.now();
  }

  async handle(request: BrowserHttpRequest): Promise<BrowserHttpResponse> {
    const authority = new URL(this.options.origin).host;
    if (request.headers.host !== authority) return json(403, browserError("invalid_browser_origin"));
    if (request.path.startsWith("/api/") && request.headers.origin !== this.options.origin)
      return json(403, browserError("invalid_browser_origin"));
    if (request.method === "OPTIONS") return json(405, browserError("method_not_allowed"));
    if (request.method === "GET" || request.method === "HEAD") return this.asset(request);
    if (request.method !== "POST") return json(405, browserError("method_not_allowed"));
    // Keep the startup-root boundary explicit: the shell route never accepts a body.
    if (request.path === "/") return json(400, browserError("invalid_request"));
    if (!(request.path in routes) && request.path !== "/api/session") return json(404, browserError("route_not_found"));
    if (this.active >= this.maxInFlight) return json(429, browserError("http_capacity", true));
    this.active += 1;
    try {
      if (request.headers["content-encoding"] || request.headers["content-type"] !== "application/json")
        return json(400, browserError("invalid_request"));
      if (request.body.byteLength > maxBodyBytes) return json(413, browserError("resource_limit"));
      let body: unknown;
      try {
        body = JSON.parse(request.body.toString("utf8"));
      } catch {
        return json(400, browserError("invalid_request"));
      }
      if (!(isRecord(body) && validBody(request.path, body))) return json(400, browserError("invalid_request"));
      const response =
        request.path === "/api/session"
          ? await this.session(body, request.headers)
          : await this.navigation(request.path, body, request.headers);
      const encoded = Buffer.byteLength(response.body);
      return encoded > maxResponseBytes ? json(413, browserError("resource_limit")) : response;
    } finally {
      this.active -= 1;
    }
  }

  private async session(
    body: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): Promise<BrowserHttpResponse> {
    const tabId = body.tab_instance_id as string;
    if (headers["x-code-explorer-tab"] !== tabId) return json(403, browserError("invalid_browser_session"));
    if (body.action === "create") {
      if (headers["x-code-explorer-session"] || this.sessions.size >= this.maxSessions)
        return json(429, browserError("project_capacity", true));
      const reply = await this.options.call("code_status", { action: "start_session" });
      if ("code" in reply) return json(errorStatus(String(reply.code)), reply);
      const coreSessionId = (reply.data as Record<string, unknown> | undefined)?.session_id;
      if (typeof coreSessionId !== "string") return json(500, browserError("internal_error"));
      const browserSessionId = crypto.randomUUID();
      this.sessions.set(browserSessionId, { coreSessionId, tabId, lastAcceptedAt: this.now() });
      return json(200, { ...reply, state: "created", data: { browser_session_id: browserSessionId } });
    }
    const browserSessionId = headers["x-code-explorer-session"];
    const session = browserSessionId ? this.sessions.get(browserSessionId) : undefined;
    if (!(browserSessionId && session) || session.tabId !== tabId)
      return json(403, browserError("invalid_browser_session"));
    const expired = this.accept(browserSessionId, session);
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

  private async navigation(
    route: string,
    body: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): Promise<BrowserHttpResponse> {
    const browserSessionId = headers["x-code-explorer-session"];
    const tabId = headers["x-code-explorer-tab"];
    const session = browserSessionId ? this.sessions.get(browserSessionId) : undefined;
    if (!(browserSessionId && session) || session.tabId !== tabId)
      return json(403, browserError("invalid_browser_session"));
    const expired = this.accept(browserSessionId, session);
    if (expired) return expired;
    const coreArguments =
      route === "/api/search"
        ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "request_id"))
        : route === "/api/status" && body.action === "status"
          ? body
          : { ...body, session_id: session.coreSessionId };
    const reply = await this.options.call(routes[route], coreArguments);
    return json("code" in reply ? errorStatus(String(reply.code)) : 200, reply);
  }

  private accept(browserSessionId: string, session: BrowserSession): BrowserHttpResponse | undefined {
    if (this.now() - session.lastAcceptedAt >= idleMilliseconds) {
      this.sessions.delete(browserSessionId);
      return json(410, browserError("browser_session_expired", true));
    }
    session.lastAcceptedAt = this.now();
    return undefined;
  }

  private async asset(request: BrowserHttpRequest): Promise<BrowserHttpResponse> {
    if (request.method !== "GET" && request.method !== "HEAD") return json(405, browserError("method_not_allowed"));
    if (
      !this.options.assetRoot ||
      request.path.includes("%") ||
      request.path.includes("..") ||
      request.path.includes("\\")
    )
      return {
        status: 404,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy": csp,
        },
        body: "",
      };
    const relative = request.path === "/" ? "index.html" : request.path.slice(1);
    if (!relative || path.isAbsolute(relative) || relative.split("/").includes(".."))
      return { status: 404, headers: {}, body: "" };
    try {
      const root = await realpath(this.options.assetRoot);
      const candidate = path.join(root, relative);
      const actual = await realpath(candidate);
      if ((!actual.startsWith(`${root}${path.sep}`) && actual !== root) || !statSync(actual).isFile())
        throw new Error("missing");
      const content = request.method === "HEAD" ? "" : await readFile(actual, "utf8");
      const type = actual.endsWith(".html")
        ? "text/html; charset=utf-8"
        : actual.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : "text/css; charset=utf-8";
      return {
        status: 200,
        headers: {
          "content-type": type,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy": csp,
        },
        body: content,
      };
    } catch {
      return {
        status: 404,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy": csp,
        },
        body: "",
      };
    }
  }
}

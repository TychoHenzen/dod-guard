const requiredKeys: Record<string, readonly string[]> = {
  "/api/search": ["request_id", "query"],
  "/api/focus": ["request_id", "symbol_id"],
  "/api/follow": ["request_id", "view_id", "handle", "relation"],
  "/api/history": ["request_id", "action"],
};

const optionalKeys: Record<string, readonly string[]> = {
  "/api/search": [
    "path_globs",
    "languages",
    "kinds",
    "content",
    "include_generated",
    "limit",
  ],
  "/api/focus": ["body_limit_bytes"],
  "/api/follow": ["limit"],
  "/api/history": ["limit"],
};

function exactKeys(
  body: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((key) => key in body) &&
    Object.keys(body).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}

function validSessionAction(body: Record<string, unknown>): boolean {
  const action = body.action;
  return (
    (action === "create" && body.document_start === "new") ||
    (action === "restore" && body.document_start === "reload")
  );
}

function validSessionBody(body: Record<string, unknown>): boolean {
  return (
    typeof body.tab_instance_id === "string" &&
    validSessionAction(body) &&
    exactKeys(body, ["action", "tab_instance_id", "document_start"])
  );
}

function validStatusBody(body: Record<string, unknown>): boolean {
  const status = body.action === "status" && exactKeys(body, ["action"]);
  const refresh =
    body.action === "refresh" &&
    typeof body.request_id === "string" &&
    exactKeys(body, ["action", "request_id"]);
  return status || refresh;
}

export function validBody(
  route: string,
  body: Record<string, unknown>,
): boolean {
  if (route === "/api/session") return validSessionBody(body);
  if (route === "/api/status") return validStatusBody(body);
  const required = requiredKeys[route];
  return (
    required !== undefined && exactKeys(body, required, optionalKeys[route])
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

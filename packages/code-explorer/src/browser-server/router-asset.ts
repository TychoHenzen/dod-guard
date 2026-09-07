import { realpath } from "node:fs/promises";
import path from "node:path";
import type { BrowserHttpRequest } from "./browser-http-request.js";
import type { BrowserHttpResponse } from "./browser-http-response.js";
import { readAssetFile } from "./router-asset-file.js";
import type { BrowserRouterContext } from "./router-context.js";
import { browserError, csp, json } from "./router-policy.js";

function notFound(): BrowserHttpResponse {
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

function unsafePath(
  request: BrowserHttpRequest,
  assetRoot: string | undefined,
): boolean {
  return (
    !assetRoot ||
    request.path.includes("%") ||
    request.path.includes("..") ||
    request.path.includes("\\")
  );
}

function contentType(actual: string): string {
  if (actual.endsWith(".html")) return "text/html; charset=utf-8";
  if (actual.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/css; charset=utf-8";
}

function relativeAssetPath(request: BrowserHttpRequest): string | undefined {
  const relative = request.path === "/" ? "index.html" : request.path.slice(1);
  if (!relative) return;
  if (path.isAbsolute(relative)) return;
  if (relative.split("/").includes("..")) return;
  return relative;
}

function isInsideRoot(root: string, actual: string): boolean {
  return actual.startsWith(`${root}${path.sep}`) || actual === root;
}

async function loadAsset(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
  relative: string,
): Promise<BrowserHttpResponse> {
  try {
    const root = await realpath(context.options.assetRoot as string);
    const actual = await realpath(path.join(root, relative));
    if (!isInsideRoot(root, actual)) return notFound();
    const body = await readAssetFile(actual, request.method === "HEAD");
    if (body === undefined) return notFound();
    return {
      status: 200,
      headers: {
        "content-type": contentType(actual),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": csp,
      },
      body,
    };
  } catch {
    return notFound();
  }
}

export async function asset(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): Promise<BrowserHttpResponse> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return json(405, browserError("method_not_allowed"));
  if (unsafePath(request, context.options.assetRoot)) return notFound();
  const relative = relativeAssetPath(request);
  if (!relative) return notFound();
  return loadAsset(context, request, relative);
}

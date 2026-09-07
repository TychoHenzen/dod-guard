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

function contentType(actual: string): string {
  if (actual.endsWith(".html")) return "text/html; charset=utf-8";
  if (actual.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/css; charset=utf-8";
}

type AssetName = "index.html" | "client.js" | "style.css";
const assetNames: Record<string, AssetName | undefined> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/client.js": "client.js",
  "/style.css": "style.css",
};

function relativeAssetPath(request: BrowserHttpRequest): AssetName | undefined {
  const rawPath = request.path.split("?")[0]?.split("#")[0] ?? "/";
  return assetNames[rawPath];
}

function isInsideRoot(root: string, actual: string): boolean {
  return actual.startsWith(`${root}${path.sep}`) || actual === root;
}

async function loadAsset(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
  relative: AssetName,
): Promise<BrowserHttpResponse> {
  try {
    const root = await realpath(context.options.assetRoot as string);
    const candidate = path.resolve(root, relative);
    const actual = await realpath(candidate);
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
  const relative = relativeAssetPath(request);
  if (!relative) return notFound();
  return loadAsset(context, request, relative);
}

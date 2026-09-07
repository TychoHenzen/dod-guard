import type { BrowserHttpRequest } from "./browser-http-request.js";
import type { BrowserHttpResponse } from "./browser-http-response.js";
import { handleRequest } from "./router-request.js";
import {
  createBrowserRouterContext,
  type BrowserRouterContext,
} from "./router-context.js";
import type { BrowserRouterOptions } from "./router-options.js";

export type { BrowserCoreCall } from "./browser-core-call.js";
export type { BrowserCoreReply } from "./browser-core-reply.js";
export type { BrowserHttpRequest } from "./browser-http-request.js";
export type { BrowserHttpResponse } from "./browser-http-response.js";
export type { MonotonicClock } from "./monotonic-clock.js";

export class BrowserHttpRouter {
  private readonly context: BrowserRouterContext;

  constructor(options: BrowserRouterOptions) {
    this.context = createBrowserRouterContext(options);
  }

  handle(request: BrowserHttpRequest): Promise<BrowserHttpResponse> {
    return handleRequest(this.context, request);
  }
}

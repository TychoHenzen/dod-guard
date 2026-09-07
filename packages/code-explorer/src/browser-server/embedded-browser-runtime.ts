import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { BrowserHttpRequest, BrowserHttpResponse } from "./http-router.js";

export type EmbeddedBrowserRuntime = {
  projectRoot: ProjectRoot;
  handle(request: BrowserHttpRequest): Promise<BrowserHttpResponse>;
  close(): Promise<void>;
};

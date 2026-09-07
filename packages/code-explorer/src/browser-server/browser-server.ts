import type { ProjectRoot } from "../semantic/api/public-api.js";

export type BrowserServer = {
  url: URL;
  projectRoot: ProjectRoot;
  close(): Promise<void>;
};

import { createServer } from "../../../index.js";
import { createNativeProjectRoot } from "../../../semantic/api/public-api.js";
import { adapter } from "./adapter.js";
import { freshness } from "./freshness.js";

export function createRefreshServer(
  directory: string,
  refresh: () => Promise<void>,
  name: () => string,
) {
  return createServer({
    projectRoot: createNativeProjectRoot(directory),
    adapters: [adapter(refresh, name)],
    freshness: freshness(),
  });
}

import type { ExplorerCore } from "./explorer-core.js";
import type { HttpListener } from "./http-listener.js";

export type PortBinder = {
  listen(
    host: "127.0.0.1",
    port: number,
    signal: AbortSignal,
    core?: ExplorerCore,
  ): Promise<HttpListener>;
};

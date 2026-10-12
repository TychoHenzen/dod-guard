import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { BrowserCoreReply } from "./browser-core-reply.js";

export type ExplorerCore = {
  close(signal: AbortSignal): Promise<void>;
  /**
   * Stdio exit path: closes sessions and the watcher only. Backend processes
   * and temp roots are released by the owned-resource registry.
   */
  terminate?(): Promise<void>;
  connect?(transport: Transport): Promise<void>;
  call?(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<BrowserCoreReply>;
};

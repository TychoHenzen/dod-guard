import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { BrowserCoreReply } from "./browser-core-reply.js";

export type ExplorerCore = {
  close(signal: AbortSignal): Promise<void>;
  connect?(transport: Transport): Promise<void>;
  call?(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<BrowserCoreReply>;
};

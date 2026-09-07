import type { BrowserCoreReply } from "./browser-core-reply.js";

export type ExplorerCore = {
  close(signal: AbortSignal): Promise<void>;
  call?(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<BrowserCoreReply>;
};

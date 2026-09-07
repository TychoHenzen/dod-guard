import type { BrowserCoreReply } from "./browser-core-reply.js";

export type BrowserCoreCall = (
  name: string,
  arguments_: Record<string, unknown>,
) => Promise<BrowserCoreReply>;

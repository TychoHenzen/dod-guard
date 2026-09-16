import { packagedReply } from "./packaged/core-replies.test.js";
export type CoreCall = { name: string; arguments_: Record<string, unknown> };
export function createPackagedCore(calls: CoreCall[]) {
  return async (name: string, arguments_: Record<string, unknown>) => {
    calls.push({ name, arguments_ });
    return packagedReply(name, arguments_);
  };
}

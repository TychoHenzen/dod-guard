import { type ExplorerCoreFactory } from "../../../../src/browser-server/lifecycle.js";
export function factory(starts: string[]): ExplorerCoreFactory {
  return {
    start: async ({ projectRoot }) => {
      starts.push(projectRoot.canonicalPath);
      return { close: async () => undefined };
    },
  };
}

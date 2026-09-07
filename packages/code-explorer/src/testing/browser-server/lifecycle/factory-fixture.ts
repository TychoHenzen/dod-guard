import { type ExplorerCoreFactory } from "../../../browser-server/lifecycle.js";
export function factory(starts: string[]): ExplorerCoreFactory {
  return {
    start: async ({ projectRoot }) => {
      starts.push(projectRoot.canonicalPath);
      return { close: async () => undefined };
    },
  };
}

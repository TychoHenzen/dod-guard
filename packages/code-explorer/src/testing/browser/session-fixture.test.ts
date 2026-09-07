import { BrowserSessionClient } from "../../browser/session.js";
import { recordStorage } from "./fixtures/storage.test.js";
import { sessionRequests } from "./session/request-fixture.test.js";

export function sessionHarness(
  type: string,
  options: {
    lockAvailable?: boolean;
    prefix?: string;
    restoreState?: string;
  } = {},
) {
  const {
    lockAvailable = true,
    prefix = "id",
    restoreState = "created",
  } = options;
  const storage: Record<string, string> = {};
  const { request, requests } = sessionRequests(prefix, restoreState);
  const client = new BrowserSessionClient({
    storage: recordStorage(storage),
    navigationType: () => type,
    lock: async (_name, action) => action(lockAvailable),
    randomId: sequentialIds(prefix),
    request,
  });
  return { client, storage, requests };
}

function sequentialIds(prefix: string): () => string {
  let id = 0;
  return () => `${prefix}-${++id}`;
}

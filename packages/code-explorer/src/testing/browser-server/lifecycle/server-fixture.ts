import { startBrowserServer } from "../../../browser-server/lifecycle.js";
import { factory } from "./factory-fixture.js";
import { fakeListener } from "./fake-listener-fixture.js";
export function startService(
  options: Partial<Parameters<typeof startBrowserServer>[0]>,
) {
  return startBrowserServer({
    project_root: ".",
    no_open: true,
    coreFactory: factory([]),
    binder: { listen: async (_host, port) => fakeListener(port, []) },
    opener: { open: async () => undefined },
    ...options,
  });
}

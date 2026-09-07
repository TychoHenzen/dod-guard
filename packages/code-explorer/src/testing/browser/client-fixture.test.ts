import { installClientRequests } from "./fixtures/client-requests.test.js";
import { installClientEnvironment } from "./fixtures/environment.test.js";
import { replaceGlobal } from "./fixtures/globals.test.js";

export function installClientFixture(
  fixtureOptions: { rootAccess?: string } = {},
) {
  const attributes = new Map<string, string>();
  const root = createRoot(attributes);
  const documentRestore = replaceGlobal("document", {
    querySelector: (selector: string) =>
      selector === "#code-explorer" ? root : null,
    querySelectorAll: () => [],
  });
  const environmentRestore = installClientEnvironment(new Map());
  const fetch = installClientRequests(fixtureOptions.rootAccess);
  return {
    attributes,
    requests: fetch.requests,
    root,
    restore: () => {
      documentRestore();
      environmentRestore();
      fetch.restore();
    },
  };
}

function createRoot(attributes: Map<string, string>) {
  return {
    textContent: "",
    innerHTML: "",
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
}

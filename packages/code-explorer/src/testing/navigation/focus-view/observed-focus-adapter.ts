import { focusAdapter } from "./focus-adapter.js";

export function observedFocusAdapter(onRequest: () => void) {
  const adapter = focusAdapter({
    body: "TypeName",
    visible_symbols: [{ name: "TypeName", symbol_id: "type-id" }],
  });
  const originalRequest = adapter.request;
  adapter.request = async (request) => {
    onRequest();
    return originalRequest(request);
  };
  return adapter;
}

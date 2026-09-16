import { readyAdapterStatus } from "../../navigation/support/adapter-status.js";
export function countingAdapter(fixture: boolean, onSearch: () => void) {
  const revision = {
    generation: 1,
    manifest_sha256: fixture ? "fixture" : "test",
  };
  return {
    status: () =>
      readyAdapterStatus({
        name: fixture ? "fixture" : "test",
        version: fixture ? "1.0.0" : "test",
      }),
    request: async () => {
      onSearch();
      return { operation: "search" as const, symbols: [], revision };
    },
  };
}

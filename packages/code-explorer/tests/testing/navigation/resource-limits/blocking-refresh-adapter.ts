import { countingAdapter } from "./counting-adapter.js";

export function blockingRefreshAdapter(
  onRefresh: () => void,
  wait: Promise<void>,
) {
  return {
    ...countingAdapter(() => undefined),
    refresh: async () => {
      onRefresh();
      await wait;
    },
  };
}

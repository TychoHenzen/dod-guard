import type { BrowserViewSnapshot } from "./browser-view-snapshot.js";

export type BrowserHistoryState = {
  entries: readonly BrowserViewSnapshot[];
  position: number;
};

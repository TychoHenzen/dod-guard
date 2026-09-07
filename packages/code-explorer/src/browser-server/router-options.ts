import type { BrowserCoreCall } from "./browser-core-call.js";
import type { MonotonicClock } from "./monotonic-clock.js";

export type BrowserRouterOptions = {
  origin: string;
  call: BrowserCoreCall;
  maxSessions?: number;
  maxInFlight?: number;
  clock?: MonotonicClock;
  assetRoot?: string;
};

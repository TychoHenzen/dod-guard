import type { BrowserSession } from "./browser-session.js";
import type { BrowserRouterOptions } from "./router-options.js";

export type BrowserRouterContext = {
  options: BrowserRouterOptions;
  sessions: Map<string, BrowserSession>;
  maxSessions: number;
  maxInFlight: number;
  now: () => number;
  active: { value: number };
};

function limitOrDefault(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

function clockFor(options: BrowserRouterOptions): () => number {
  return () => {
    if (options.clock) return options.clock.nowMilliseconds();
    return performance.now();
  };
}

export function createBrowserRouterContext(
  options: BrowserRouterOptions,
): BrowserRouterContext {
  return {
    options,
    sessions: new Map(),
    maxSessions: limitOrDefault(options.maxSessions, 8),
    maxInFlight: limitOrDefault(options.maxInFlight, 8),
    now: clockFor(options),
    active: { value: 0 },
  };
}

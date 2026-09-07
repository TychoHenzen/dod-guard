import type { BrowserStorage } from "../../../browser/session.js";

export function mapStorage(values = new Map<string, string>()): BrowserStorage {
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => { values.set(key, value); },
    clear: () => values.clear(),
  };
}

export function recordStorage(values: Record<string, string>): BrowserStorage {
  return {
    get: (key) => values[key] ?? null,
    set: (key, value) => { values[key] = value; },
    clear: () => {
      for (const key of Object.keys(values)) delete values[key];
    },
  };
}

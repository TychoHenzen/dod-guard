import type { FocusedSource } from "./source.js";

export type BrowserFocus = {
  view_id: string;
  symbol_id: string;
  name: string;
  source?: FocusedSource;
};

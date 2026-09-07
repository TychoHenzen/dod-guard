export type BrowserViewSnapshot = {
  view_id: string;
  symbol_id: string;
  source: Record<string, unknown>;
  relations: Record<string, unknown>;
  graph: Record<string, unknown>;
  stale: boolean;
};

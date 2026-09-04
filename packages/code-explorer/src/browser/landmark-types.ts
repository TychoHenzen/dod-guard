export type LandmarkGroup = {
  group: string;
  items: readonly (string | { symbol_id: string; name: string; path: string; kind: string })[];
};

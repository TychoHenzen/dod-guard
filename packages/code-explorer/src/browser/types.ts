export type LandmarkGroup = {
  group: string;
  items: readonly (string | { symbol_id: string; name: string; path: string; kind: string })[];
};

export type BrowserOperation =
  | "search"
  | "focus"
  | "back"
  | "forward"
  | "refocus"
  | "refresh"
  | "status"
  | "set_filters"
  | "set_drawer";

export type BrowserShellState = {
  landmarks: readonly LandmarkGroup[];
  focus?: { name: string; path: string; kind: string };
  activeDrawer?: "discovery" | "relations";
  status: string;
  navigationEnabled: boolean;
};

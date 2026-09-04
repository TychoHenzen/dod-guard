import type { LandmarkGroup } from "./landmark-types.js";

export type BrowserShellState = {
  landmarks: readonly LandmarkGroup[];
  focus?: { name: string; path: string; kind: string };
  activeDrawer?: "discovery" | "relations";
  status: string;
  navigationEnabled: boolean;
};

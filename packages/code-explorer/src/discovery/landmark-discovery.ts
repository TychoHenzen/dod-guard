import type { LandmarkGroup } from "./landmark-group.js";

export type LandmarkDiscovery = {
  state: "ready" | "landmarks_not_ready";
  landmarks: readonly LandmarkGroup[];
};

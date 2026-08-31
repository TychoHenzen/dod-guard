export type LandmarkDiscovery = {
  state: "ready" | "landmarks_not_ready";
  landmarks: readonly LandmarkGroup[];
};

export type LandmarkSymbol = {
  symbol_id: string;
  name: string;
  path: string;
  kind: string;
};

export type LandmarkGroup = {
  group: string;
  symbols: readonly LandmarkSymbol[];
};

const MAX_LANDMARK_GROUPS = 5;
const MAX_LANDMARKS_PER_GROUP = 10;

/** Keeps precomputed landmark identities selectable while later analysis owns their score and classification. */
export function readyLandmarks(groups: readonly LandmarkGroup[]): LandmarkDiscovery {
  return {
    state: "ready",
    landmarks: groups.slice(0, MAX_LANDMARK_GROUPS).map((group) => ({
      group: group.group,
      symbols: group.symbols.slice(0, MAX_LANDMARKS_PER_GROUP),
    })),
  };
}

/** Keeps empty-query routing separate from ordinary symbol and file matching. */
export function landmarksNotReady(): LandmarkDiscovery {
  return { state: "landmarks_not_ready", landmarks: [] };
}

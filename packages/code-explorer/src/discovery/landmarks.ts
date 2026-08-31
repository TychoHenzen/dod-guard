export type LandmarkDiscovery = {
  state: "ready" | "landmarks_not_ready";
  landmarks: readonly unknown[];
};

/** Keeps empty-query routing separate from ordinary symbol and file matching. */
export function landmarksNotReady(): LandmarkDiscovery {
  return { state: "landmarks_not_ready", landmarks: [] };
}

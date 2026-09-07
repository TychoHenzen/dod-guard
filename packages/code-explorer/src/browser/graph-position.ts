import type { GraphLane } from "./graph-lane.js";

export type GraphPosition = {
  lane: GraphLane;
  x: "16%" | "50%" | "84%";
  y: number;
};

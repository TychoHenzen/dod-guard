import type { BrowserLandmark } from "./browser-landmark.js";

export type BrowserLandmarkGroup = {
  group: string;
  items: readonly BrowserLandmark[];
};

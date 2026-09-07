export const landmarkGroupNames = [
  "messages_or_events",
  "services",
  "entry_points",
  "types",
  "common_actions",
] as const;

export type LandmarkGroupName = (typeof landmarkGroupNames)[number];

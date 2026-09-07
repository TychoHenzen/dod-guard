export type DiscoveryCandidate =
  | {
      type: "symbol";
      name: string;
      path: string;
      kind: string;
      identity: string;
    }
  | { type: "file"; path: string; identity: string };

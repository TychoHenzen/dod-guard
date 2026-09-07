import type { PathClassification } from "./path-classification.js";
import type { DiscoveryMatch } from "./discovery-match.js";

export type DiscoveryResult = DiscoveryMatch & PathClassification;

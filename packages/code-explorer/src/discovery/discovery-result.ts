import type { DiscoveryMatch } from "./discovery-match.js";
import type { PathClassification } from "./path-classification.js";

export type DiscoveryResult = DiscoveryMatch & PathClassification;

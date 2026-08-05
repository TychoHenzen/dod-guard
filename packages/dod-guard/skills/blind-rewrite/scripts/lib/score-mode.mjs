// Maps a --mode value to its scoring function. Code mode compares
// declarations and lines; prose mode compares sentences and their order.

import { scoreOverlap } from "./overlap-metrics.mjs";
import { scoreProseOverlap } from "./prose-metrics.mjs";

const SCORERS = {
  code: scoreOverlap,
  prose: scoreProseOverlap,
};

export function resolveScorer(mode) {
  return SCORERS[mode] ?? null;
}

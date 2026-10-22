// --- Scoring ---
// Weights sum to 100, ranked by how hard the post-4.6 guidance leans on
// each property: conciseness and scaffolding removal carry the most.

export const WEIGHTS = {
  "line-count": 15,
  "no-scaffolding": 15,
  "no-conservative-filters": 8,
  "no-contradictions": 8,
  "explicit-scope": 6,
  "no-implicit-scope": 5,
  "no-drip-fed": 5,
  "no-redundant-repetition": 5,
  "no-constraining-examples": 5,
  "delegation-cap": 5,
  "description-triggers": 5,
  "no-bare-negatives": 4,
  "description-present": 3,
  "emphasis-density": 3,
  "name-format": 2,
  "description-person": 2,
  "no-at-imports": 2,
  "no-time-sensitive": 1,
  "consistent-terminology": 1,
};

function lineCountScore(lines, targets) {
  const { warn, fail } = targets;
  const span = fail - warn;
  if (lines <= warn) return 1;
  if (lines <= fail) return 1 - (0.5 * (lines - warn)) / span;
  return Math.max(0, 0.5 - (lines - fail) / (4 * span));
}

const boolScore = (c) => (c.pass ? 1 : 0);
const countScore = (tolerance) => (c) => Math.max(0, 1 - c.value / tolerance);

const SCORERS = {
  "line-count": (c) => lineCountScore(c.value, c.targets),
  "name-format": boolScore,
  "description-present": boolScore,
  "description-person": boolScore,
  "description-triggers": boolScore,
  "explicit-scope": boolScore,
  "delegation-cap": boolScore,
  "no-at-imports": countScore(2),
  "no-scaffolding": countScore(5),
  "no-conservative-filters": countScore(3),
  "no-bare-negatives": countScore(4),
  "no-implicit-scope": countScore(4),
  "no-drip-fed": countScore(4),
  "no-redundant-repetition": countScore(4),
  "no-time-sensitive": countScore(2),
  "no-constraining-examples": countScore(3),
  "no-contradictions": countScore(3),
  "consistent-terminology": countScore(3),
  "emphasis-density": (c) => Math.max(0, 1 - Math.max(0, c.value - 2) / 4),
  "memory-frontmatter": boolScore,
  "agent-tools": boolScore,
  "instinct-frontmatter": boolScore,
};

export function applyScores(checks, weights) {
  for (const c of checks) {
    c.weight = weights[c.id];
    c.score = Number(SCORERS[c.id](c).toFixed(3));
  }
  return checks;
}

export function overallScore(checks) {
  let total = 0;
  for (const c of checks) total += (c.weight ?? 0) * (c.score ?? 0);
  return Math.round(total);
}

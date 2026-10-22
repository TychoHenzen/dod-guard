import { WEIGHTS } from "./scoring.mjs";

// --- Per-kind check membership and weights ---
// Every artifact kind runs a subset of the 19 checks above, plus whatever
// kind-specific checks apply only to it. Weights are taken from ALL_WEIGHTS
// and renormalized so each kind's own subset sums to 100 - that keeps scores
// from different kinds on one comparable scale. A kind-specific check's
// weight lives in KIND_EXTRA_WEIGHTS, scoped to the one kind that runs it,
// so it never enters the skill kind's 19-check baseline.

const CHECK_IDS = Object.keys(WEIGHTS);

const KIND_EXTRA_WEIGHTS = {
  agent: { "agent-tools": 8 },
  memory: { "memory-frontmatter": 8 },
  instinct: { "instinct-frontmatter": 8 },
};

const ALL_WEIGHTS = {
  ...WEIGHTS,
  ...Object.assign({}, ...Object.values(KIND_EXTRA_WEIGHTS)),
};

const FRONTMATTER_CHECK_IDS = ["name-format", "description-present", "description-person", "description-triggers"];

function checkIdsExcluding(...excluded) {
  const drop = new Set(excluded);
  return CHECK_IDS.filter((id) => !drop.has(id));
}

function renormalizedWeights(ids) {
  const sum = ids.reduce((total, id) => total + ALL_WEIGHTS[id], 0);
  const weights = {};
  for (const id of ids) weights[id] = (ALL_WEIGHTS[id] * 100) / sum;
  return weights;
}

const KIND_CHECK_IDS = {
  skill: CHECK_IDS,
  agent: [...checkIdsExcluding("delegation-cap"), ...Object.keys(KIND_EXTRA_WEIGHTS.agent)],
  "claude-md": checkIdsExcluding(...FRONTMATTER_CHECK_IDS, "delegation-cap"),
  memory: [...checkIdsExcluding("description-triggers", "delegation-cap"), ...Object.keys(KIND_EXTRA_WEIGHTS.memory)],
  instinct: [
    ...checkIdsExcluding(...FRONTMATTER_CHECK_IDS, "delegation-cap"),
    ...Object.keys(KIND_EXTRA_WEIGHTS.instinct),
  ],
};

export const KINDS = Object.fromEntries(
  Object.entries(KIND_CHECK_IDS).map(([kind, ids]) => [kind, { checkIds: ids, weights: renormalizedWeights(ids) }]),
);

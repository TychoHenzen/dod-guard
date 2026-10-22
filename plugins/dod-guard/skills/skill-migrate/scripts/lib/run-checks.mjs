import { checkConservativeFilters, checkScaffolding } from "./checks-anti-patterns.mjs";
import { checkBareNegatives, checkContradictions } from "./checks-directives.mjs";
import { checkInstinctFrontmatter } from "./checks-instinct.mjs";
import { checkAgentTools, checkMemoryFrontmatter } from "./checks-kind-frontmatter.mjs";
import {
  checkDescriptionPerson,
  checkDescriptionPresent,
  checkDescriptionTriggers,
  checkLineCount,
  checkNameFormat,
  checkNoAtImports,
} from "./checks-metadata.mjs";
import { checkDripFed, checkEmphasisDensity, checkImplicitScope, checkTimeSensitive } from "./checks-patterns.mjs";
import { checkRedundantRepetition } from "./checks-repetition.mjs";
import {
  checkConsistentTerminology,
  checkDelegationCap,
  checkExplicitScope,
  checkWorkedExamples,
} from "./checks-structure.mjs";
import { KINDS } from "./kind-tables.mjs";
import { LINE_COUNT_TARGETS } from "./kinds.mjs";
import { applyScores } from "./scoring.mjs";
import { bodyAfterFrontmatter, parseFrontmatter, rawFrontmatterText } from "./text.mjs";

// --- Run all checks ---

const CHECK_RUNNERS = {
  "line-count": (fm, body, kind) => checkLineCount(body, LINE_COUNT_TARGETS[kind]),
  "name-format": (fm, body) => checkNameFormat(fm),
  "description-present": (fm, body) => checkDescriptionPresent(fm),
  "description-person": (fm, body) => checkDescriptionPerson(fm),
  "description-triggers": (fm, body) => checkDescriptionTriggers(fm),
  "no-at-imports": (fm, body) => checkNoAtImports(body),
  "no-scaffolding": (fm, body) => checkScaffolding(body),
  "no-conservative-filters": (fm, body) => checkConservativeFilters(body),
  "no-bare-negatives": (fm, body) => checkBareNegatives(body),
  "no-implicit-scope": (fm, body) => checkImplicitScope(body),
  "no-drip-fed": (fm, body) => checkDripFed(body),
  "no-time-sensitive": (fm, body) => checkTimeSensitive(body),
  "emphasis-density": (fm, body) => checkEmphasisDensity(body),
  "no-redundant-repetition": (fm, body) => checkRedundantRepetition(body),
  "explicit-scope": (fm, body) => checkExplicitScope(body),
  "delegation-cap": (fm, body) => checkDelegationCap(body),
  "no-constraining-examples": (fm, body) => checkWorkedExamples(body),
  "no-contradictions": (fm, body) => checkContradictions(body),
  "consistent-terminology": (fm, body, kind) => checkConsistentTerminology(body, kind),
  "memory-frontmatter": (fm, body, kind, rawFm) => checkMemoryFrontmatter(fm, rawFm),
  "agent-tools": (fm) => checkAgentTools(fm),
  "instinct-frontmatter": (fm) => checkInstinctFrontmatter(fm),
};

export function runChecks(text, kind) {
  const fm = parseFrontmatter(text);
  const body = bodyAfterFrontmatter(text);
  const rawFm = rawFrontmatterText(text);
  const { checkIds, weights } = KINDS[kind];
  const checks = checkIds.map((id) => CHECK_RUNNERS[id](fm, body, kind, rawFm));
  return applyScores(checks, weights);
}

// The rules behind check-skill-hygiene. Each returns failure messages, so an
// empty array means the rule passed.
//
// OpenSpec owns a change's artifacts and the rules for authoring them.
// dod-guard owns proof. A skill owns choreography. Every rule here fails a
// skill that has taken back one of the other two jobs.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toPosix, walkFiles } from "./fs-utils.mjs";

/** The skills that run outside OpenSpec and therefore need a change id. */
const CHANGE_SCOPED_SKILLS = ["adversarial-workflow", "blind-rewrite", "tighten"];

/** The skill that closes a run by archiving the change it proved. */
const CLOSING_GATE_SKILLS = ["adversarial-workflow"];

const PREDICATE_TYPES = [
  "exit_code",
  "exit_code_not",
  "output_contains",
  "output_not_contains",
  "output_matches",
  "output_not_matches",
  "tdd",
  "adversarial",
  "holdout",
  "convergence",
];

/** Naming this many predicate types is a second copy of the vocabulary. */
const VOCABULARY_COPY_FLOOR = 5;

/**
 * Docs a reader is told to trust. A stale path in one of these sends the next
 * session to a directory that no longer exists.
 */
const SHIPPED_DOCS = [
  "CLAUDE.md",
  ".gitignore",
  "packages/dod-guard/README.md",
  "packages/dod-guard/USAGE.md",
  "packages/dod-guard/CLAUDE.md",
  "packages/quality-guard/README.md",
  "scripts/ci/lib/fs-utils.mjs",
  "packages/quality-guard/skills/quality-refactor/scripts/lib/config.mjs",
];

function skills(root) {
  const out = [];
  for (const file of walkFiles(join(root, "packages"))) {
    const posix = toPosix(root, file);
    const match = /packages\/[^/]+\/skills\/([^/]+)\/SKILL\.md$/.exec(posix);
    if (match) out.push({ name: match[1], path: posix, text: readFileSync(file, "utf8") });
  }
  return out;
}

function skillNamed(root, name) {
  return skills(root).find((skill) => skill.name === name) ?? null;
}

function shippedDocs(root) {
  const out = [];
  for (const rel of SHIPPED_DOCS) {
    const full = join(root, rel);
    if (existsSync(full)) out.push({ path: rel, text: readFileSync(full, "utf8") });
  }
  return out;
}

function requireOneSkill(root, name, check) {
  const skill = skillNamed(root, name);
  if (!skill) return [`the ${name} skill is missing`];
  return check(skill);
}

function authoringCopies(skill) {
  const bad = [];
  if (/^\|\s*Predicate\s*\|/m.test(skill.text)) bad.push(`${skill.path} carries a predicate table`);
  if (/^\|\s*Category\s*\|/m.test(skill.text)) bad.push(`${skill.path} carries a proof category table`);

  const named = PREDICATE_TYPES.filter((type) => skill.text.includes(`\`${type}\``));
  if (named.length >= VOCABULARY_COPY_FLOOR) {
    bad.push(`${skill.path} names ${named.length} predicate types, so it holds a second copy of the vocabulary`);
  }
  // A JSON literal spelling out the old steps.json shape is a copy. HTML
  // comment examples (`<!-- verify_surface: code -->`) are fine - that is
  // the tasks.md inline metadata format skills document directly.
  const jsonLiteral = (skill.text.match(/```json[\s\S]*?```/g) ?? []).some((b) => b.includes("verify_surface"));
  if (jsonLiteral) bad.push(`${skill.path} spells out the steps.json shape in a JSON literal`);
  return bad;
}

export const RULES = {
  "no-step-session": (root) =>
    [...skills(root), ...shippedDocs(root)]
      .filter(({ text }) => text.includes(".step-session"))
      .map(({ path }) => `${path} still names .step-session`),

  "plan-home": (root) =>
    requireOneSkill(root, "step-by-step", (skill) =>
      /openspec\/changes\/<id>\/tasks\.md/.test(skill.text)
        ? []
        : [`${skill.path} does not name openspec/changes/<id>/tasks.md as the plan home`],
    ),

  "no-authoring-copy": (root) => skills(root).flatMap(authoringCopies),

  "no-legacy-fallback": (root) => {
    const bad = [];
    const claimsInterviewBuildsDod = /\binterview\b[^.]{0,80}\b(builds|generates)\b[^.]{0,20}\bDoD\b/i;
    for (const { path, text } of skills(root)) {
      if (text.includes("dod_create")) bad.push(`${path} still names dod_create`);
      if (text.includes("docs/plans")) bad.push(`${path} still writes to docs/plans`);
      if (claimsInterviewBuildsDod.test(text)) bad.push(`${path} still claims interview builds a DoD`);
    }
    return bad;
  },

  "change-scoped": (root) =>
    CHANGE_SCOPED_SKILLS.flatMap((name) =>
      requireOneSkill(root, name, (skill) =>
        /change[ -]id|openspec\/changes\//.test(skill.text)
          ? []
          : [`${skill.path} names no change id, so it runs outside OpenSpec`],
      ),
    ),

  "closing-gate": (root) =>
    CLOSING_GATE_SKILLS.flatMap((name) =>
      requireOneSkill(root, name, (skill) => {
        const cover = skill.text.indexOf("dod-guard cover");
        const archive = skill.text.indexOf("openspec archive");
        const bad = [];
        if (cover === -1) bad.push(`${skill.path} never runs dod-guard cover`);
        if (archive === -1) bad.push(`${skill.path} never runs openspec archive`);
        if (cover !== -1 && archive !== -1 && cover > archive) {
          bad.push(`${skill.path} archives before it covers, so it can ship a regressed scenario`);
        }
        return bad;
      }),
    ),

  "refactor-skip-specs": (root) =>
    requireOneSkill(root, "quality-refactor", (skill) =>
      skill.text.includes("skip_specs")
        ? []
        : [`${skill.path} opens no change with skip_specs, so a refactor has nowhere to record its plan`],
    ),
};

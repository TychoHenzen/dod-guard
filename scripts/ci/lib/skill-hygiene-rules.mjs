// The rules behind check-skill-hygiene. Each returns failure messages, so an
// empty array means the rule passed.
//
// OpenSpec owns a change's artifacts and the rules for authoring them.
// dod-guard owns proof. A skill owns choreography. Every rule here fails a
// skill that has taken back one of the other two jobs.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toPosix, walkFiles } from "./fs-utils.mjs";

/** The four skills that ran outside OpenSpec before this gate existed. */
const CHANGE_SCOPED_SKILLS = ["ratchet", "adversarial-workflow", "blind-rewrite", "tighten"];

/** Both skills that close a run by archiving the change they proved. */
const CLOSING_GATE_SKILLS = ["ratchet", "adversarial-workflow"];

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

const PROOF_CATEGORIES = ["behavioral", "wiring", "test_audit", "other"];

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

function schemaText(root) {
  const file = join(root, "openspec", "schemas", "dod-guard-spec-driven", "schema.yaml");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/**
 * One artifact's block from schema.yaml, without a YAML parser. A block runs
 * from its `- id: <name>` line to the next list entry at the same indent or
 * the next top-level key.
 */
function artifactBlock(text, id) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^(\\s*)-\\s+id:\\s*${id}\\s*$`).test(line));
  if (start === -1) return null;
  const indent = /^(\s*)-/.exec(lines[start])[1];
  const nextEntry = new RegExp(`^${indent}-\\s+id:`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (nextEntry.test(lines[i]) || /^[A-Za-z_]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
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
  // Naming a step field in prose is fine. The schema template is the one
  // place that spells the shape out, so a literal is the copy.
  const literal = (skill.text.match(/```[\s\S]*?```/g) ?? []).some((b) => b.includes("verify_surface"));
  if (literal) bad.push(`${skill.path} spells out the steps.json shape in a literal`);
  return bad;
}

export const RULES = {
  "no-step-session": (root) =>
    [...skills(root), ...shippedDocs(root)]
      .filter(({ text }) => text.includes(".step-session"))
      .map(({ path }) => `${path} still names .step-session`),

  "plan-home": (root) =>
    requireOneSkill(root, "step-by-step", (skill) =>
      /openspec\/changes\/<id>\/steps\.json/.test(skill.text)
        ? []
        : [`${skill.path} does not name openspec/changes/<id>/steps.json as the plan home`],
    ),

  "no-authoring-copy": (root) => skills(root).flatMap(authoringCopies),

  "no-legacy-fallback": (root) => {
    const bad = [];
    for (const { path, text } of skills(root)) {
      if (text.includes("dod_create")) bad.push(`${path} still names dod_create`);
      if (text.includes("docs/plans")) bad.push(`${path} still writes to docs/plans`);
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
        const trace = skill.text.indexOf("dod-guard trace");
        const archive = skill.text.indexOf("openspec archive");
        const bad = [];
        if (trace === -1) bad.push(`${skill.path} never runs dod-guard trace`);
        if (archive === -1) bad.push(`${skill.path} never runs openspec archive`);
        if (trace !== -1 && archive !== -1 && trace > archive) {
          bad.push(`${skill.path} archives before it traces, so it can ship an untraced leaf`);
        }
        return bad;
      }),
    ),

  "interview-fetches": (root) =>
    requireOneSkill(root, "interview", (skill) =>
      skill.text.includes("openspec instructions dod")
        ? []
        : [`${skill.path} does not fetch the dod rules with openspec instructions dod`],
    ),

  "refactor-skip-specs": (root) =>
    requireOneSkill(root, "quality-refactor", (skill) =>
      skill.text.includes("skip_specs")
        ? []
        : [`${skill.path} opens no change with skip_specs, so a refactor has nowhere to record its plan`],
    ),

  "dod-instruction": (root) => {
    const text = schemaText(root);
    if (text === null) return ["openspec/schemas/dod-guard-spec-driven/schema.yaml is missing"];
    const block = artifactBlock(text, "dod");
    if (block === null) return ["the schema declares no dod artifact"];

    const bad = [];
    if (/placeholder|later migration step/i.test(block)) bad.push("the dod instruction is still a placeholder");
    const predicates = PREDICATE_TYPES.filter((type) => !block.includes(type));
    if (predicates.length > 0) bad.push(`the dod instruction omits predicate type(s): ${predicates.join(", ")}`);
    const categories = PROOF_CATEGORIES.filter((cat) => !block.includes(cat));
    if (categories.length > 0) bad.push(`the dod instruction omits proof categor(ies): ${categories.join(", ")}`);
    if (!block.includes("dod_generate")) bad.push("the dod instruction never names dod_generate as the producer");
    return bad;
  },

  "schema-steps-deps": (root) => {
    const text = schemaText(root);
    if (text === null) return ["openspec/schemas/dod-guard-spec-driven/schema.yaml is missing"];
    const block = artifactBlock(text, "steps");
    if (block === null) return ["the schema declares no steps artifact"];

    const requires = /requires:\s*((?:\s*-\s*\w+\s*)+)/.exec(block);
    const listed = requires ? requires[1].match(/-\s*(\w+)/g).map((item) => item.replace(/-\s*/, "")) : [];
    const bad = [];
    if (!listed.includes("tasks")) bad.push("the steps artifact does not require tasks");
    if (listed.includes("dod")) {
      bad.push("the steps artifact still requires dod, which locks out a change with no spec delta");
    }
    return bad;
  },
};

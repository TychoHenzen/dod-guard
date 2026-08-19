// Every rule gets both directions: a tree that violates it and a tree that
// satisfies it. A rule that only ever passes is the failure this guard exists
// to catch, and one direction cannot show that.

import { deepStrictEqual, match, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { goodTree, write } from "./fixtures/skill-hygiene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "check-skill-hygiene.mjs");
const RULES_MODULE = join(HERE, "lib", "skill-hygiene-rules.mjs");

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function tree() {
  const root = goodTree();
  temps.push(root);
  return root;
}

function run(root, rule) {
  const args = [SCRIPT, `--root=${root}`];
  if (rule) args.push(`--rule=${rule}`);
  const res = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

const SKILL = {
  interview: "packages/dod-guard/skills/interview/SKILL.md",
  stepByStep: "packages/dod-guard/skills/step-by-step/SKILL.md",
  cheapStep: "packages/dod-guard/skills/cheap-step/SKILL.md",
  adversarial: "packages/dod-guard/skills/adversarial-workflow/SKILL.md",
  tighten: "packages/dod-guard/skills/tighten/SKILL.md",
  refactor: "packages/quality-guard/skills/quality-refactor/SKILL.md",
};
const FETCHES = "Run `openspec instructions dod`.";

const cases = [
  {
    rule: "no-step-session",
    why: "a skill still names the retired session directory",
    break: (root) => write(root, SKILL.cheapStep, "Session state lives in `.step-session/`.\n"),
    expect: /still names \.step-session/,
  },
  {
    rule: "no-step-session",
    why: "a shipped doc still names it",
    break: (root) => write(root, "CLAUDE.md", "Session state in `.step-session/` survives compaction.\n"),
    expect: /CLAUDE\.md still names \.step-session/,
  },
  {
    rule: "plan-home",
    why: "the executor names no plan home",
    break: (root) => write(root, SKILL.stepByStep, "# Step by step\n\nRun the plan.\n"),
    expect: /does not name openspec\/changes/,
  },
  {
    rule: "no-authoring-copy",
    why: "a skill carries a predicate table",
    break: (root) => write(root, SKILL.interview, `${FETCHES}\n\n| Predicate | Passes when |\n|---|---|\n`),
    expect: /carries a predicate table/,
  },
  {
    rule: "no-authoring-copy",
    why: "a skill carries a category table",
    break: (root) => write(root, SKILL.interview, `${FETCHES}\n\n| Category | Use for |\n|---|---|\n`),
    expect: /carries a proof category table/,
  },
  {
    rule: "no-authoring-copy",
    why: "a skill names the whole predicate vocabulary",
    break: (root) =>
      write(
        root,
        SKILL.interview,
        `${FETCHES} Use \`exit_code\`, \`output_contains\`, \`output_matches\`, \`tdd\`, \`holdout\`.\n`,
      ),
    expect: /names \d+ predicate types/,
  },
  {
    rule: "no-authoring-copy",
    why: "a skill spells out the steps.json shape in a JSON literal",
    break: (root) =>
      write(root, SKILL.refactor, 'Set `skip_specs: true`.\n\n```json\n{ "verify_surface": "code" }\n```\n'),
    expect: /spells out the steps\.json shape in a JSON literal/,
  },
  {
    rule: "no-legacy-fallback",
    why: "a skill still falls back to dod_create",
    break: (root) =>
      write(root, SKILL.adversarial, "Interview calls `dod_create`. Then `dod-guard trace` and `openspec archive`.\n"),
    expect: /still names dod_create/,
  },
  {
    rule: "no-legacy-fallback",
    why: "a skill still writes to docs/plans",
    break: (root) => write(root, SKILL.interview, `${FETCHES} Write docs/plans/2026-01-01-topic.md.\n`),
    expect: /still writes to docs\/plans/,
  },
  {
    rule: "no-legacy-fallback",
    why: "a skill claims interview builds a DoD",
    break: (root) =>
      write(root, SKILL.adversarial, "Take a change id. `/dod-guard:interview` builds a DoD to start from.\n"),
    expect: /still claims interview builds a DoD/,
  },
  {
    rule: "change-scoped",
    why: "a skill runs with no change id",
    break: (root) => write(root, SKILL.tighten, "# Tighten\n\nRank targets in a ledger and rewrite the worst.\n"),
    expect: /names no change id/,
  },
  {
    rule: "closing-gate",
    why: "a skill never covers",
    break: (root) => write(root, SKILL.adversarial, "Take a change id, then `openspec archive <change-id> --yes`.\n"),
    expect: /never runs dod-guard cover/,
  },
  {
    rule: "closing-gate",
    why: "a skill archives before it covers",
    break: (root) =>
      write(
        root,
        SKILL.adversarial,
        "Take a change id. Run `openspec archive <change-id> --yes`, then `dod-guard cover <change-id>`.\n",
      ),
    expect: /archives before it covers/,
  },
  {
    rule: "refactor-skip-specs",
    why: "a refactor pass opens no spec-less change",
    break: (root) => write(root, SKILL.refactor, "# Quality refactor\n\nEmit a plan.\n"),
    expect: /opens no change with skip_specs/,
  },
];

describe("check-skill-hygiene", () => {
  it("passes every rule on a clean tree", () => {
    const { code, out } = run(tree());
    strictEqual(code, 0, out);
    match(out, /skill hygiene OK/);
  });

  it("rejects an unknown rule with exit 3", () => {
    const { code, out } = run(tree(), "no-such-rule");
    strictEqual(code, 3);
    match(out, /unknown rule/);
  });

  it("rejects an unknown option with exit 3", () => {
    const res = spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" });
    strictEqual(res.status, 3);
    match(res.stderr, /unknown option/);
  });

  for (const testCase of cases) {
    it(`${testCase.rule} fails when ${testCase.why}`, () => {
      const root = tree();
      // The rule passes before the break, so the failure is the break's doing.
      strictEqual(run(root, testCase.rule).code, 0, `${testCase.rule} did not pass on the clean tree`);
      testCase.break(root);
      const { code, out } = run(root, testCase.rule);
      strictEqual(code, 1, `expected a violation, got:\n${out}`);
      match(out, testCase.expect);
    });
  }

  it("covers every rule the script defines", () => {
    const block = /export const RULES = \{([\s\S]*?)\n\};/.exec(readFileSync(RULES_MODULE, "utf8"))[1];
    const defined = [...block.matchAll(/^ {2}"([a-z-]+)":/gm)].map((m) => m[1]).sort();
    const covered = [...new Set(cases.map((c) => c.rule))].sort();
    deepStrictEqual(covered, defined, "every rule needs a failing fixture");
  });
});

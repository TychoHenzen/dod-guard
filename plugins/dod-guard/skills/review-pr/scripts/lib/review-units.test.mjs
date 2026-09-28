// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { MAX_UNIT_FILES, fileKind, planReviewUnits } from "./review-units.mjs";

const TREE = [
  "package.json",
  "plugins/dod-guard/skills/goal-sdlc/SKILL.md",
  "plugins/dod-guard/skills/goal-sdlc/scripts/lib/queue-readback.mjs",
  "plugins/dod-guard/skills/goal-sdlc/scripts/lib/queue-readback.test.mjs",
  "plugins/dod-guard/agents/review-pr-feature.md",
  "packages/fossil/package.json",
  "packages/fossil/src/cli.ts",
];

test("groups a skill's prose, code, and tests into one unit with their angles", () => {
  const units = planReviewUnits(
    [
      "plugins/dod-guard/skills/goal-sdlc/SKILL.md",
      "plugins/dod-guard/skills/goal-sdlc/scripts/lib/queue-readback.mjs",
      "plugins/dod-guard/skills/goal-sdlc/scripts/lib/queue-readback.test.mjs",
    ],
    TREE,
  );

  assert.deepEqual(units, [
    {
      id: "plugins/dod-guard/skills/goal-sdlc",
      owner: "plugins/dod-guard/skills/goal-sdlc",
      files: [
        "plugins/dod-guard/skills/goal-sdlc/SKILL.md",
        "plugins/dod-guard/skills/goal-sdlc/scripts/lib/queue-readback.mjs",
        "plugins/dod-guard/skills/goal-sdlc/scripts/lib/queue-readback.test.mjs",
      ],
      angles: ["review-pr-feature", "review-pr-design", "review-pr-reliability", "review-pr-hygiene"],
    },
  ]);
});

test("falls back to the file's directory when no owner marker is above it", () => {
  const units = planReviewUnits(["plugins/dod-guard/agents/review-pr-feature.md", ".github/workflows/ci.yml"], TREE);

  assert.deepEqual(
    units.map(({ id, angles }) => ({ id, angles })),
    [
      { id: ".github/workflows", angles: ["review-pr-reliability"] },
      { id: "plugins/dod-guard/agents", angles: ["review-pr-hygiene"] },
    ],
  );
});

test("does not let the repository root package.json swallow every file", () => {
  const units = planReviewUnits(["packages/fossil/src/cli.ts", "scripts/ci/check.mjs"], TREE);

  assert.deepEqual(units.map(({ id }) => id), ["packages/fossil", "scripts/ci"]);
});

test("splits an owner with more than the file cap into numbered units", () => {
  const files = Array.from({ length: MAX_UNIT_FILES + 1 }, (_, index) => `packages/fossil/src/f${index}.ts`);

  const units = planReviewUnits(files, TREE);

  assert.deepEqual(units.map(({ id, files: unitFiles }) => [id, unitFiles.length]), [
    ["packages/fossil#1", MAX_UNIT_FILES],
    ["packages/fossil#2", 1],
  ]);
});

test("classifies files by kind", () => {
  assert.equal(fileKind("src/a.test.ts"), "test");
  assert.equal(fileKind("packages/x/tests/helper.ts"), "test");
  assert.equal(fileKind("src/a.mjs"), "code");
  assert.equal(fileKind("README.md"), "prose");
  assert.equal(fileKind("package.json"), "config");
  assert.equal(fileKind(".github/workflows/ci.yml"), "config");
  assert.equal(fileKind("LICENSE"), "prose");
});

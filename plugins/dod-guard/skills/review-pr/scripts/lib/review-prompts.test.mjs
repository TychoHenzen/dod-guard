// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { buildDispatchInput, diffByFile } from "./review-prompts.mjs";

const DIFF = [
  "diff --git a/src/app.mjs b/src/app.mjs",
  "@@ -1,0 +2 @@",
  "+export const ready = true;",
  "diff --git a/docs/guide.md b/docs/guide.md",
  "@@ -3 +3 @@",
  "-old line",
  "+new line",
].join("\n");
const AGENTS = {
  "review-pr-feature": "# Feature reviewer",
  "review-pr-design": "# Design reviewer",
  "review-pr-reliability": "# Reliability reviewer",
  "review-pr-hygiene": "# Hygiene reviewer",
};
const CONTEXT = {
  repository: "owner/repo",
  headSha: "abc1234",
  changedFiles: ["docs/guide.md", "src/app.mjs", "src/removed.mjs"],
  reviewRequirements: ["User can open it"],
  workItem: { acceptanceCriteria: "- [ ] User can open it" },
};
const UNITS = [
  { id: "docs", files: ["docs/guide.md"], angles: ["review-pr-hygiene"] },
  { id: "src", files: ["src/app.mjs", "src/removed.mjs"], angles: ["review-pr-design", "review-pr-reliability"] },
];
const CONTENTS = new Map([
  ["docs/guide.md", "new line\n"],
  ["src/app.mjs", "const x = 1;\nexport const ready = true;\n"],
]);

test("dispatches the PR-level feature pass first, then each unit's angles", () => {
  const input = buildDispatchInput({ context: CONTEXT, units: UNITS, contents: CONTENTS, diff: DIFF, agents: AGENTS });

  assert.deepEqual(
    input.reviewers.map(({ reviewer, unit }) => [reviewer, unit]),
    [
      ["review-pr-feature", "pull-request"],
      ["review-pr-hygiene", "docs"],
      ["review-pr-design", "src"],
      ["review-pr-reliability", "src"],
    ],
  );
});

test("embeds a unit's final contents and only its own diff in the prompt", () => {
  const input = buildDispatchInput({ context: CONTEXT, units: UNITS, contents: CONTENTS, diff: DIFF, agents: AGENTS });
  const design = input.reviewers.find(({ reviewer }) => reviewer === "review-pr-design").prompt;

  assert.ok(design.startsWith("# Design reviewer"));
  assert.ok(design.includes("### src/app.mjs\n\n```\nconst x = 1;\nexport const ready = true;\n```"));
  assert.ok(design.includes("### src/removed.mjs\n\n(not present at the reviewed head)"));
  assert.ok(design.includes("+export const ready = true;"));
  assert.ok(!design.includes("+new line"));
});

test("fences evidence longer than any backtick run so Markdown content stays inside its block", () => {
  const guide = "# Guide\n\n```bash\nnpm test\n```\n\nInline ````quad```` ticks.\n";
  const contents = new Map([...CONTENTS, ["docs/guide.md", guide]]);
  const input = buildDispatchInput({ context: CONTEXT, units: UNITS, contents, diff: DIFF, agents: AGENTS });
  const hygiene = input.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;

  assert.ok(hygiene.includes(`### docs/guide.md\n\n\`\`\`\`\`\n${guide}\`\`\`\`\`\n\n## Diff`));
});

test("splits a unified diff by the file each section changes", () => {
  const sections = diffByFile(DIFF);

  assert.deepEqual([...sections.keys()], ["src/app.mjs", "docs/guide.md"]);
  assert.ok(sections.get("docs/guide.md").endsWith("+new line"));
});

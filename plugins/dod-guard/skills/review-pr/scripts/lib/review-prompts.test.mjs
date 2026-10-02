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
const MANY_BACKTICK_RUNS = 200_000;
// Keep this below the 64 MiB per-file snapshot cap while matching the large-run failure shape.
// biome-ignore lint/style/noMagicNumbers: Match the documented large-run regression size.
const LARGE_BACKTICK_RUN_BYTES = 22 * 1024 * 1024;
// Exercise the alternate fence at its boundary while keeping the source readable in the prompt.
const ALTERNATE_FENCE_RUN_LENGTH = 256;
const EVIDENCE_PREVIEW_BYTES = 1024;
const AGGREGATE_PROMPT_ERROR = /Aggregate reviewer prompt size exceeds/;
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

test("handles many separate backtick runs without spreading them into a function call", () => {
  const guide = "`x".repeat(MANY_BACKTICK_RUNS);
  const contents = new Map([...CONTENTS, ["docs/guide.md", guide]]);
  const input = buildDispatchInput({ context: CONTEXT, units: UNITS, contents, diff: DIFF, agents: AGENTS });
  const hygiene = input.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;

  assert.ok(hygiene.includes(`### docs/guide.md\n\n\`\`\`\n${guide}\n\`\`\``));
});

test("uses bounded readable evidence for one oversized backtick run", () => {
  const guide = "`".repeat(LARGE_BACKTICK_RUN_BYTES);
  const context = { ...CONTEXT, changedFiles: ["docs/guide.md"] };
  const input = buildDispatchInput({
    context,
    units: [],
    contents: new Map([...CONTENTS, ["docs/guide.md", guide]]),
    diff: DIFF,
    agents: AGENTS,
  });
  const [{ prompt }] = input.reviewers;

  assert.ok(prompt.includes(`~~~\n${guide.slice(0, EVIDENCE_PREVIEW_BYTES)}`));
  assert.ok(prompt.includes(`${guide.slice(-EVIDENCE_PREVIEW_BYTES)}\n~~~`));
  assert.equal(prompt.includes("base64 UTF-8 evidence"), false);
});

test("keeps source and diff readable when the alternate fence is needed", () => {
  const guide = [
    "const markdown = \"",
    "`".repeat(ALTERNATE_FENCE_RUN_LENGTH),
    "\";\n",
  ].join("");
  const context = { ...CONTEXT, changedFiles: ["docs/guide.md"] };
  const [{ prompt }] = buildDispatchInput({
    context,
    units: [],
    contents: new Map([...CONTENTS, ["docs/guide.md", guide]]),
    diff: DIFF,
    agents: AGENTS,
  }).reviewers;

  assert.ok(prompt.includes(`~~~\n${guide}~~~`));
  assert.ok(prompt.includes("-old line\n+new line"));
  assert.equal(prompt.includes("base64 UTF-8 evidence"), false);
});

test("rejects aggregate reviewer prompts that exceed the size cap", () => {
  const guide = "`".repeat(LARGE_BACKTICK_RUN_BYTES);
  const context = { ...CONTEXT, changedFiles: ["docs/guide.md"] };
  const units = [{
    id: "docs",
    files: ["docs/guide.md"],
    angles: ["review-pr-hygiene", "review-pr-design", "review-pr-reliability"],
  }];

  assert.throws(
    () => buildDispatchInput({ context, units, contents: new Map([...CONTENTS, ["docs/guide.md", guide]]), diff: DIFF, agents: AGENTS }),
    AGGREGATE_PROMPT_ERROR,
  );
});

test("marks content without a final newline instead of normalizing it silently", () => {
  const withoutFinalNewline = new Map([...CONTENTS, ["docs/guide.md", "x"]]);
  const withFinalNewline = new Map([...CONTENTS, ["docs/guide.md", "x\n"]]);
  const missingNewlineInput = buildDispatchInput({ context: CONTEXT, units: UNITS, contents: withoutFinalNewline, diff: DIFF, agents: AGENTS });
  const finalNewlineInput = buildDispatchInput({ context: CONTEXT, units: UNITS, contents: withFinalNewline, diff: DIFF, agents: AGENTS });
  const missingNewlinePrompt = missingNewlineInput.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;
  const finalNewlinePrompt = finalNewlineInput.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;

  assert.ok(missingNewlinePrompt.includes("### docs/guide.md\n\n```\nx\n```\n(source content has no final newline)"));
  assert.ok(finalNewlinePrompt.includes("### docs/guide.md\n\n```\nx\n```\n\n## Diff"));
  assert.equal(finalNewlinePrompt.includes("### docs/guide.md\n\n```\nx\n```\n(source content has no final newline)"), false);
});

test("marks missing final newlines only on final-file evidence", () => {
  const context = { ...CONTEXT, changedFiles: ["docs/guide.md"] };
  const input = buildDispatchInput({
    context,
    units: [],
    contents: new Map([...CONTENTS, ["docs/guide.md", "x"]]),
    diff: DIFF,
    agents: AGENTS,
  });
  const [{ prompt }] = input.reviewers;
  const marker = "(source content has no final newline)";
  const finalFilesStart = prompt.indexOf("## Final files");
  const diffStart = prompt.indexOf("## Diff");

  assert.ok(prompt.slice(finalFilesStart, diffStart).includes(marker));
  assert.equal(prompt.slice(0, finalFilesStart).includes(marker), false);
  assert.equal(prompt.slice(diffStart).includes(marker), false);
});

test("distinguishes empty content from content containing one final newline", () => {
  const emptyInput = buildDispatchInput({
    context: CONTEXT,
    units: UNITS,
    contents: new Map([...CONTENTS, ["docs/guide.md", ""]]),
    diff: DIFF,
    agents: AGENTS,
  });
  const newlineInput = buildDispatchInput({
    context: CONTEXT,
    units: UNITS,
    contents: new Map([...CONTENTS, ["docs/guide.md", "\n"]]),
    diff: DIFF,
    agents: AGENTS,
  });
  const emptyPrompt = emptyInput.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;
  const newlinePrompt = newlineInput.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;

  assert.ok(emptyPrompt.includes("### docs/guide.md\n\n```\n\n```\n(source content has no final newline)"));
  assert.ok(newlinePrompt.includes("### docs/guide.md\n\n```\n\n```\n\n## Diff"));
  assert.notEqual(emptyPrompt, newlinePrompt);
});

test("lists omitted binary evidence instead of fencing it as file content", () => {
  const omitted = { omitted: "binary or non-UTF-8, sha256 abc, 6 bytes" };
  const contents = new Map([...CONTENTS, ["docs/guide.md", omitted]]);
  const input = buildDispatchInput({ context: CONTEXT, units: UNITS, contents, diff: DIFF, agents: AGENTS });
  const hygiene = input.reviewers.find(({ reviewer }) => reviewer === "review-pr-hygiene").prompt;

  assert.ok(hygiene.includes("### docs/guide.md\n\n(not embedded: binary or non-UTF-8, sha256 abc, 6 bytes)"));
});

test("splits a unified diff by the file each section changes", () => {
  const sections = diffByFile(DIFF);

  assert.deepEqual([...sections.keys()], ["src/app.mjs", "docs/guide.md"]);
  assert.ok(sections.get("docs/guide.md").endsWith("+new line"));
});

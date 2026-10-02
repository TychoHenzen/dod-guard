import { diffSectionPath, isDiffHeader } from "./unified-diff.mjs";
import { PULL_REQUEST_UNIT } from "./review-units.mjs";

const BACKTICK_RUN = /`+/gu;
const MINIMUM_FENCE_LENGTH = 3;
const MAX_FENCE_LENGTH = 256;
// biome-ignore lint/style/noMagicNumbers: Keep aggregate nested-review prompts bounded to 64 MiB.
const MAX_PROMPT_BYTES = 64 * 1024 * 1024;
const ALTERNATE_FENCE = "~~~";

// Nested reviewers may be unable to run shell reads on the host, so every
// prompt carries its unit's final file contents and diff instead of paths.

function diffByFile(diff) {
  const sections = [];
  for (const line of diff.split("\n")) {
    if (isDiffHeader(line)) {
      sections.push([]);
    }
    sections.at(-1)?.push(line);
  }
  return new Map(sections.map((lines) => [diffSectionPath(lines), lines.join("\n").trimEnd()]));
}

function finalNewlineNote(content) {
  if (content.endsWith("\n")) {
    return "";
  }
  return "\n(source content has no final newline)";
}

// The fence must outlast every backtick run in the content, or a reviewed
// Markdown file closes the block early and the reviewer reads altered evidence.
function fenced(content, info = "") {
  let longestRun = 0;
  for (const run of content.matchAll(BACKTICK_RUN)) {
    longestRun = Math.max(longestRun, run[0].length);
  }
  if (longestRun >= MAX_FENCE_LENGTH) {
    const encoded = Buffer.from(content, "utf8").toString("base64");
    return `${ALTERNATE_FENCE}${info}\n(base64 UTF-8 evidence; decode before review)\n${encoded}\n${ALTERNATE_FENCE}${finalNewlineNote(content)}`;
  }
  const fence = "`".repeat(Math.max(MINIMUM_FENCE_LENGTH, longestRun + 1));
  let body = content;
  if (!content.endsWith("\n")) {
    body += "\n";
  }
  return `${fence}${info}\n${body}${fence}${finalNewlineNote(content)}`;
}

function fileBlock(path, contents) {
  const content = contents.get(path);
  if (content === undefined || content === null) {
    return `### ${path}\n\n(not present at the reviewed head)`;
  }
  if (typeof content.omitted === "string") {
    return `### ${path}\n\n(not embedded: ${content.omitted})`;
  }
  return `### ${path}\n\n${fenced(content)}`;
}

function unitPrompt({ agent, context, unit, contents, diffs }) {
  const scope = {
    repository: context.repository,
    headSha: context.headSha,
    unit: { id: unit.id, files: unit.files },
    reviewRequirements: context.reviewRequirements,
    workItem: context.workItem,
  };
  const diff = unit.files.map((path) => diffs.get(path)).filter(Boolean).join("\n");
  return [
    agent.trimEnd(),
    "## Review unit\n\nReview only the files in this unit, at the angle defined above. The final file contents and the unified diff below are your evidence; cite final-state lines from them.",
    fenced(JSON.stringify(scope, null, 2), "json"),
    "## Final files",
    ...unit.files.map((path) => fileBlock(path, contents)),
    `## Diff\n\n${fenced(diff, "diff")}`,
  ].join("\n\n");
}

function buildDispatchInput({ context, units, contents, diff, agents }) {
  const diffs = diffByFile(diff);
  const pullRequest = { id: PULL_REQUEST_UNIT, files: context.changedFiles };
  const entries = [
    { reviewer: "review-pr-feature", unit: pullRequest },
    ...units.flatMap((unit) => unit.angles.map((reviewer) => ({ reviewer, unit }))),
  ];
  const reviewers = [];
  let promptBytes = 0;
  for (const { reviewer, unit } of entries) {
    const prompt = unitPrompt({ agent: agents[reviewer], context, unit, contents, diffs });
    promptBytes += Buffer.byteLength(prompt, "utf8");
    if (promptBytes > MAX_PROMPT_BYTES) {
      throw new Error(`Aggregate reviewer prompt size exceeds ${MAX_PROMPT_BYTES} UTF-8 bytes.`);
    }
    reviewers.push({ reviewer, unit: unit.id, prompt });
  }
  return { reviewers };
}

export { buildDispatchInput, diffByFile };

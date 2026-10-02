import { diffSectionPath, isDiffHeader } from "./unified-diff.mjs";
import { PULL_REQUEST_UNIT } from "./review-units.mjs";

const BACKTICK_RUN = /`+/gu;
const MINIMUM_FENCE_LENGTH = 3;

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

// The fence must outlast every backtick run in the content, or a reviewed
// Markdown file closes the block early and the reviewer reads altered evidence.
function fenced(content, info = "") {
  const longestRun = Math.max(0, ...(content.match(BACKTICK_RUN) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(MINIMUM_FENCE_LENGTH, longestRun + 1));
  let body = content;
  if (!body.endsWith("\n")) {
    body += "\n";
  }
  return `${fence}${info}\n${body}${fence}`;
}

function fileBlock(path, contents) {
  const content = contents.get(path);
  if (content === undefined || content === null) {
    return `### ${path}\n\n(not present at the reviewed head)`;
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
  return {
    reviewers: entries.map(({ reviewer, unit }) => ({
      reviewer,
      unit: unit.id,
      prompt: unitPrompt({ agent: agents[reviewer], context, unit, contents, diffs }),
    })),
  };
}

export { buildDispatchInput, diffByFile };

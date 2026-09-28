import { PULL_REQUEST_UNIT } from "./review-units.mjs";

const DIFF_FILE_HEADER = /^diff --git a\/.+ b\/(.+)$/;

// Nested reviewers may be unable to run shell reads on the host, so every
// prompt carries its unit's final file contents and diff instead of paths.
function diffByFile(diff) {
  const sections = new Map();
  let current = null;
  for (const line of diff.split("\n")) {
    const header = line.match(DIFF_FILE_HEADER);
    if (header) {
      [, current] = header;
      sections.set(current, []);
    }
    if (current) {
      sections.get(current).push(line);
    }
  }
  return new Map([...sections].map(([path, lines]) => [path, lines.join("\n").trimEnd()]));
}

function fileBlock(path, contents) {
  const content = contents.get(path);
  if (content === undefined || content === null) {
    return `### ${path}\n\n(not present at the reviewed head)`;
  }
  return `### ${path}\n\n\`\`\`\n${content.trimEnd()}\n\`\`\``;
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
    `\`\`\`json\n${JSON.stringify(scope, null, 2)}\n\`\`\``,
    "## Final files",
    ...unit.files.map((path) => fileBlock(path, contents)),
    `## Diff\n\n\`\`\`diff\n${diff}\n\`\`\``,
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

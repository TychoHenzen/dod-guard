import { acceptanceCriteria } from "../../../../lib/acceptance-criteria.mjs";
import { API_REPOSITORY_URL, urlRepository } from "../../../../lib/repository-identity.mjs";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

// The saved `gh api repos/{owner}/{repo}/issues/{n}` response. source names
// the file in every error.
function pbiIssue(value, source) {
  const repository = urlRepository(value?.repository_url, API_REPOSITORY_URL);
  const body = value?.body;
  if (!(isObject(value) && repository !== null && positiveInteger(value.number) && (typeof body === "string" || body === null))) {
    throw new Error(`${source}: the PBI issue JSON needs a repository_url, a positive integer number, and a string or null body`);
  }
  return { repository, number: value.number, body: body ?? "" };
}

// The saved `gh api --paginate --slurp .../sub_issues?per_page=100` listing: an
// array of pages, or one plain array. An empty listing is valid.
function subIssueList(value, source) {
  if (!Array.isArray(value)) {
    throw new Error(`${source}: the sub-issue listing must be a JSON array`);
  }
  const seen = new Set();
  return value.flat().map((child, index) => {
    const repository = urlRepository(child?.repository_url, API_REPOSITORY_URL);
    if (!(repository !== null && positiveInteger(child?.number) && typeof child?.title === "string" && child.title.trim() !== "")) {
      throw new Error(`${source}: sub-issue ${index + 1} needs a repository_url, a positive integer number, and a title`);
    }
    const reference = `${repository}#${child.number}`;
    if (seen.has(reference)) {
      throw new Error(`${source}: sub-issue ${reference} appears more than once`);
    }
    seen.add(reference);
    return { repository, number: child.number, title: child.title.trim() };
  });
}

// One slot per review target, in a fixed order: files with added lines in diff
// order, then acceptance criteria in document order, then sub-issues in listing
// order. The same inputs always give the same slots.
function reviewSlots({ changedLines, pbi, subIssues }) {
  // Approving a review that saw no changed file would be false.
  if (changedLines.size === 0) {
    throw new Error("The diff names no changed files");
  }
  const criteria = acceptanceCriteria(pbi.body);
  if (criteria.length === 0) {
    throw new Error(`PBI ${pbi.repository}#${pbi.number} has no checkbox item under ## Acceptance criteria`);
  }
  return [
    ...[...changedLines]
      .filter(([, lines]) => lines.size > 0)
      .map(([path]) => ({ slot: `file:${path}`, kind: "file", text: path })),
    ...criteria.map((item, index) => ({ slot: `criterion:${index + 1}`, kind: "criterion", text: item.text })),
    ...subIssues.map((child) => ({
      slot: `sub-issue:${child.repository}#${child.number}`,
      kind: "sub-issue",
      text: child.title,
    })),
  ];
}

export { pbiIssue, reviewSlots, subIssueList };

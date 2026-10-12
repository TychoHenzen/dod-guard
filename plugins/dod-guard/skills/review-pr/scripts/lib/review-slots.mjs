import { REVIEWERS } from "./reviewer-results.mjs";
import { acceptanceCriteria } from "../../../../lib/acceptance-criteria.mjs";
import {
  API_REPOSITORY_URL,
  urlRepository,
} from "../../../../lib/repository-identity.mjs";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPbiShape(value, repository) {
  return (
    isObject(value) &&
    repository !== null &&
    positiveInteger(value.number) &&
    (typeof value.body === "string" || value.body === null)
  );
}

// The saved `gh api repos/{owner}/{repo}/issues/{n}` response. source names
// the file in every error.
function pbiIssue(value, source) {
  const repository = urlRepository(value?.repository_url, API_REPOSITORY_URL);
  const body = value?.body;
  if (!isPbiShape(value, repository)) {
    throw new Error(
      `${source}: the PBI issue JSON needs a repository_url, ` +
        "a positive integer number, and a string or null body",
    );
  }
  return { repository, number: value.number, body: body ?? "" };
}

function isSubIssueShape(child, repository) {
  return (
    repository !== null &&
    positiveInteger(child?.number) &&
    typeof child?.title === "string" &&
    child.title.trim() !== ""
  );
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
    if (!isSubIssueShape(child, repository)) {
      throw new Error(
        `${source}: sub-issue ${index + 1} needs a repository_url, ` +
          "a positive integer number, and a title",
      );
    }
    const reference = `${repository}#${child.number}`;
    // ASSUMPTION: GitHub lists each sub-issue once, so a repeat means a corrupt
    // listing; two equal slot ids would make the plan ambiguous.
    if (seen.has(reference)) {
      throw new Error(
        `${source}: sub-issue ${reference} appears more than once`,
      );
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
    throw new Error(
      `PBI ${pbi.repository}#${pbi.number} has no checkbox item ` +
        "under ## Acceptance criteria",
    );
  }
  return [
    ...[...changedLines]
      .filter(([, lines]) => lines.size > 0)
      .map(([path]) => ({ slot: `file:${path}`, kind: "file", text: path })),
    ...criteria.map((item, index) => ({
      slot: `criterion:${index + 1}`,
      kind: "criterion",
      text: item.text,
    })),
    ...subIssues.map((child) => ({
      slot: `sub-issue:${child.repository}#${child.number}`,
      kind: "sub-issue",
      text: child.title,
    })),
  ];
}

// After the main thread checks an investigator's answer, a question is
// verified, verified after the one allowed repair, or reported as not
// answerable from the repository.
const STATUSES = Object.freeze(["verified", "repaired", "unanswered"]);

function oneLine(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// Text that contains HTML could close the details block early.
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function namesFiles(question) {
  return (
    Array.isArray(question?.files) &&
    question.files.length > 0 &&
    question.files.every((file) => oneLine(file) !== "")
  );
}

function isCompleteQuestion(question) {
  return (
    REVIEWERS.includes(question?.lens) &&
    oneLine(question?.id) !== "" &&
    oneLine(question?.question) !== "" &&
    namesFiles(question) &&
    STATUSES.includes(question?.status)
  );
}

function isCompleteExclusion(excluded) {
  return REVIEWERS.includes(excluded?.lens) && oneLine(excluded?.reason) !== "";
}

// A slot ends the plan with questions or with one exclusion, never both and
// never neither.
function requireEntryShape(entry) {
  const { slot } = entry;
  const asked = entry.questions !== undefined;
  const excluded = entry.excluded !== undefined;
  if (asked && excluded) {
    throw new Error(`Slot ${slot} has both questions and an exclusion`);
  }
  if (!(asked || excluded)) {
    throw new Error(`Slot ${slot} has neither questions nor an exclusion`);
  }
  if (excluded && !isCompleteExclusion(entry.excluded)) {
    throw new Error(
      `The exclusion for slot ${slot} needs a reviewer lens and a reason`,
    );
  }
  if (
    asked &&
    !(Array.isArray(entry.questions) && entry.questions.length > 0)
  ) {
    throw new Error(`Slot ${slot} needs a non-empty questions array`);
  }
}

function requireQuestion(question, slot, ids) {
  if (!isCompleteQuestion(question)) {
    throw new Error(
      `Question ${JSON.stringify(question?.id ?? null)} in slot ${slot} ` +
        "needs an id, a reviewer lens, a question, a files list, " +
        `and a status of ${STATUSES.join(", ")}`,
    );
  }
  const id = oneLine(question.id);
  if (ids.has(id)) {
    throw new Error(`Question ${id} appears more than once`);
  }
  ids.add(id);
}

function entryLenses(entry) {
  return entry.excluded
    ? [entry.excluded.lens]
    : entry.questions.map((question) => question.lens);
}

function requirePlanEntries(plan, generated) {
  const planned = new Set();
  const ids = new Set();
  for (const entry of plan) {
    const slot = entry?.slot;
    if (!generated.has(slot)) {
      throw new Error(
        `Plan slot ${JSON.stringify(slot ?? null)} was not generated ` +
          "from the diff and the PBI",
      );
    }
    // ASSUMPTION: one plan entry per slot; two entries would leave the slot
    // block and the lens assignment ambiguous.
    if (planned.has(slot)) {
      throw new Error(`Plan slot ${slot} appears more than once`);
    }
    planned.add(slot);
    requireEntryShape(entry);
    for (const question of entry.questions ?? []) {
      requireQuestion(question, slot, ids);
    }
  }
  return planned;
}

function requireEveryLens(plan) {
  // Each judge needs at least one assigned slot to rule on.
  const idle = REVIEWERS.filter(
    (lens) => !plan.some((entry) => entryLenses(entry).includes(lens)),
  );
  if (idle.length > 0) {
    throw new Error(`No question or exclusion for ${idle.join(", ")}`);
  }
}

// The planner fills the slots the script generated; it cannot add, drop, or
// rename one.
function requirePlan(plan, slots) {
  if (!Array.isArray(plan)) {
    throw new Error("The review plan must be a JSON array");
  }
  const planned = requirePlanEntries(
    plan,
    new Set(slots.map((item) => item.slot)),
  );
  const missing = slots
    .map((item) => item.slot)
    .filter((slot) => !planned.has(slot));
  if (missing.length > 0) {
    throw new Error(`Slots missing from the plan: ${missing.join(", ")}`);
  }
  requireEveryLens(plan);
}

function slotHeading(item) {
  const id = escapeHtml(item.slot);
  return item.kind === "file"
    ? `**${id}**`
    : `**${id}**: ${escapeHtml(oneLine(item.text))}`;
}

function entryLines(entry) {
  if (entry.excluded) {
    return [
      `- excluded for ${entry.excluded.lens}: ${escapeHtml(oneLine(entry.excluded.reason))}`,
    ];
  }
  return entry.questions.map(
    (question) =>
      `- ${escapeHtml(oneLine(question.id))} ${question.lens} (${question.status}): ${escapeHtml(oneLine(question.question))}`,
  );
}

// Lists every slot, in generated order, with its questions and statuses or its
// exclusion. Call only after requirePlan.
function slotsBlock(plan, slots) {
  const bySlot = new Map(plan.map((entry) => [entry.slot, entry]));
  const lines = [
    "<details>",
    `<summary>Review plan slots (${slots.length})</summary>`,
  ];
  for (const item of slots) {
    lines.push("", slotHeading(item), "", ...entryLines(bySlot.get(item.slot)));
  }
  lines.push("", "</details>");
  return lines.join("\n");
}

// Maps each lens to the slots its judge must rule on: a slot with a question of
// that lens, or an exclusion that names it. Call only after requirePlan.
function slotsByLens(plan) {
  const byLens = new Map(REVIEWERS.map((lens) => [lens, new Set()]));
  for (const entry of plan) {
    for (const lens of entryLenses(entry)) {
      byLens.get(lens).add(entry.slot);
    }
  }
  return byLens;
}

export {
  pbiIssue,
  requirePlan,
  reviewSlots,
  slotsBlock,
  slotsByLens,
  subIssueList,
};

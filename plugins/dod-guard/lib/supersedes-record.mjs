// Reads a replacement root's `supersedes` record (standards/project-workflow.md). The closure plan
// and select-next both read the record here, so they hold the same issues.
import { markdownSection } from "./acceptance-criteria.mjs";
import { issueFor } from "./closure-index.mjs";
import { jsonBlock, subsections } from "./record-readers.mjs";

const ISSUE_REFERENCE = /^([\w.-]+\/[\w.-]+)#\d+$/;

function supersedesEntryError(entry, repository) {
  if (Number.isInteger(entry) && entry > 0) return null;
  const reference = typeof entry === "string" ? ISSUE_REFERENCE.exec(entry) : null;
  if (reference && reference[1].toLowerCase() !== String(repository).toLowerCase()) {
    return `names cross-repository issue ${entry}`;
  }
  return `has malformed entry ${JSON.stringify(entry)}`;
}

function supersedesValueError(value, repository) {
  if (!Array.isArray(value) || value.length === 0) return "is not a non-empty array";
  const problem = value.map((entry) => supersedesEntryError(entry, repository)).find(Boolean);
  if (problem) return problem;
  return new Set(value).size === value.length ? null : "repeats an issue number";
}

// Returns { numbers: [] } when the body has no record, { numbers } for a valid
// record, and { error } naming why the record cannot be used.
function parseSupersedes(body, repository) {
  const records = subsections(markdownSection(body, "Implementation notes"), "supersedes");
  if (records.length === 0) return { numbers: [] };
  if (records.length > 1) return { error: "duplicate supersedes record" };
  const block = jsonBlock(records[0]);
  const problem = block.error || supersedesValueError(block.value, repository);
  return problem ? { error: `supersedes record ${problem}` } : { numbers: block.value };
}

function supersedesRecords(index) {
  const roots = new Map();
  const errors = [];
  for (const number of index.order) {
    const { numbers = [], error } = parseSupersedes(issueFor(index, number)?.body, index.repository);
    if (error) errors.push({ issue: number, reasons: [error] });
    if (numbers.length > 0) roots.set(number, numbers);
  }
  return { roots, errors };
}

function rootsNaming(roots, original) {
  return [...roots].filter(([, numbers]) => numbers.includes(original)).map(([root]) => root);
}

export { rootsNaming, supersedesRecords };

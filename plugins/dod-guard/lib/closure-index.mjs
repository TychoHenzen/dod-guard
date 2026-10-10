// Indexes a queue snapshot for the closure helper and the queue classifier. Records are matched by repository and number,
// never by number alone. A Project item, issue, or pull request from another repository can share
// a number with a target record, so the index keys each kind by "owner/name#N" and no foreign
// record reaches a decision.

import { API_RECORD_URL, API_REPOSITORY_URL, repositoryName, urlRepository } from "./repository-identity.mjs";

const RELATION_LABELS = Object.freeze({
  subIssue: "cross-repository sub-issue",
  parent: "cross-repository parent",
  pullRequest: "cross-repository linked pull request",
});
const STATUS_NOT_STRING = "Project item Status is not a string";

function present(value) {
  return value !== undefined && value !== null;
}

function numberOf(value) {
  const number = Number(value?.number ?? value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function fieldValue(item, name) {
  return (Array.isArray(item?.fields) ? item.fields : []).find((field) => field?.name === name)?.value;
}

// The target repository as a lowercase key, or null when the snapshot names none.
function targetKey(repository) {
  const name = repositoryName(repository);
  return name === null ? null : name.toLowerCase();
}

function isTargetRepository(repository, target) {
  return repository !== null && target !== null && repository.toLowerCase() === target;
}

function qualifiedKey(repository, number) {
  return repository === null || number === null ? null : `${repository.toLowerCase()}#${number}`;
}

// A Project item's repository is the first present of its own repository, its Repository field,
// and its content repository. Its content URL counts only when none of those is present.
function itemRepository(item) {
  if (present(item?.repository)) return repositoryName(item.repository);
  const field = fieldValue(item, "Repository");
  if (present(field)) return repositoryName(field);
  if (present(item?.content?.repository)) return repositoryName(item.content.repository);
  return urlRepository(item?.content?.repository_url, API_REPOSITORY_URL);
}

function recordRepository(record) {
  if (present(record?.repository)) return repositoryName(record.repository);
  return urlRepository(record?.repository_url, API_REPOSITORY_URL);
}

// A relation reference names its repository the same way, or by the URL of the issue or pull
// request it points at.
function referenceRepository(reference) {
  if (present(reference?.repository)) return repositoryName(reference.repository);
  if (present(reference?.repository_url)) return urlRepository(reference.repository_url, API_REPOSITORY_URL);
  return urlRepository(reference?.url, API_RECORD_URL);
}

// A target reference is one in the target repository with a usable number. The number is part of
// the identity, so a reference without one is never read as a target child or parent.
function isTargetReference(reference, target) {
  return isTargetRepository(referenceRepository(reference), target) && numberOf(reference) !== null;
}

// Every lookup for a target number goes through the target key, so a foreign record can never
// answer for a target issue.
function issueFor(index, number) {
  return index.issues.get(qualifiedKey(index.repository, number)) ?? null;
}

function itemFor(index, number) {
  return index.items.get(qualifiedKey(index.repository, number)) ?? null;
}

function pullFor(index, number) {
  return index.pulls.get(qualifiedKey(index.repository, number)) ?? null;
}

// The Status as a name: a non-blank string, or an object whose name is one. Absent and null
// give null. Anything else that is present is unreadable, see statusUnreadable.
function itemStatus(item) {
  const value = fieldValue(item, "Status");
  if (typeof value === "string") return value.trim() === "" ? null : value;
  return typeof value?.name === "string" && value.name.trim() !== "" ? value.name : null;
}

// A Status that is present but is not a name. It is held, never read as Done and never repaired,
// because writing Done over a value nobody could read would hide what the item says.
function statusUnreadable(item) {
  return present(fieldValue(item, "Status")) && itemStatus(item) === null;
}

function linkedPullValues(item) {
  const value = fieldValue(item, "Linked pull requests");
  return Array.isArray(value) ? value : [];
}

function itemPullNumbers(index, item) {
  return linkedPullValues(item)
    .filter((pull) => isTargetReference(pull, index.target))
    .map(numberOf);
}

// Groups the records of one kind by qualified key. A foreign record is dropped, whatever its number. A target
// record with no number cannot be keyed, so it is held rather than dropped. A record with no repository is
// held too, and is never defaulted to the target repository.
function groupRecords(records, { repositoryOf, numberOfRecord, target }) {
  const groups = new Map();
  const unidentified = [];
  for (const record of Array.isArray(records) ? records : []) {
    const repository = repositoryOf(record);
    const number = numberOfRecord(record);
    if (repository === null) {
      unidentified.push({ record, number, reason: "repository identity missing" });
    } else if (isTargetRepository(repository, target) && number === null) {
      unidentified.push({ record, number, reason: "issue number missing" });
    } else if (isTargetRepository(repository, target)) {
      const key = qualifiedKey(repository, number);
      groups.set(key, [...(groups.get(key) ?? []), { record, number }]);
    }
  }
  return { groups, unidentified };
}

// Keeps the one record each key names. A key that two records share is ambiguous, so neither is
// kept: no decision may depend on which of the two the array happens to list last.
function unambiguous(groups) {
  const kept = new Map();
  const duplicated = [];
  for (const [key, entries] of groups) {
    if (entries.length === 1) kept.set(key, entries[0].record);
    else duplicated.push({ key, number: entries[0].number });
  }
  return { kept, duplicated };
}

// The number of each group whose key unambiguous() kept, in first-seen order. A key that two records
// share has no record to read, so it is left out here; its duplication is reported through problems.
function keptNumbers(groups, kept) {
  return [...groups].filter(([key]) => kept.has(key)).map(([, [first]]) => first.number);
}

function unidentifiedHolds(unidentified, kind) {
  return unidentified.map(({ record, number, reason }) => ({
    issue: null,
    reasons: [reason],
    record: { kind, number, itemId: kind === "item" ? (record.id ?? null) : null },
  }));
}

function linkedPullKeys(item) {
  return linkedPullValues(item).map((pull) => qualifiedKey(referenceRepository(pull), numberOf(pull)));
}

function duplicatePullHolds(items, duplicated, target) {
  const keys = new Set(duplicated.map(({ key }) => key));
  return (Array.isArray(items) ? items : [])
    .filter((entry) => numberOf(entry?.content) !== null && isTargetRepository(itemRepository(entry), target))
    // ASSUMPTION: a duplicated pull request is named on the target issues whose Project item links it,
    // because that item is the only place a delivery reaches its pull request.
    .filter((entry) => linkedPullKeys(entry).some((key) => keys.has(key)))
    .map((entry) => ({ issue: numberOf(entry.content), reasons: ["duplicate pull request record"] }));
}

function indexSnapshot(snapshot) {
  const repository = repositoryName(snapshot?.repository);
  const target = targetKey(snapshot?.repository);
  const itemGroups = groupRecords(snapshot?.items, {
    repositoryOf: itemRepository,
    numberOfRecord: (item) => numberOf(item?.content),
    target,
  });
  const issueGroups = groupRecords(snapshot?.issues, {
    repositoryOf: recordRepository,
    numberOfRecord: numberOf,
    target,
  });
  const pullGroups = groupRecords(snapshot?.pullRequests, {
    repositoryOf: recordRepository,
    numberOfRecord: numberOf,
    target,
  });
  const items = unambiguous(itemGroups.groups);
  const issues = unambiguous(issueGroups.groups);
  const pulls = unambiguous(pullGroups.groups);
  const order = keptNumbers(issueGroups.groups, issues.kept);
  const itemNumbers = keptNumbers(itemGroups.groups, items.kept);
  return {
    repository,
    target,
    defaultBranch: snapshot?.defaultBranch ?? null,
    items: items.kept,
    issues: issues.kept,
    pulls: pulls.kept,
    order,
    numbers: [...new Set([...order, ...itemNumbers])],
    itemOrder: itemNumbers,
    problems: [
      ...unidentifiedHolds(itemGroups.unidentified, "item"),
      ...unidentifiedHolds(issueGroups.unidentified, "issue"),
      ...unidentifiedHolds(pullGroups.unidentified, "pullRequest"),
      ...items.duplicated.map(({ number }) => ({ issue: number, reasons: ["duplicate Project item"] })),
      ...issues.duplicated.map(({ number }) => ({ issue: number, reasons: ["duplicate issue record"] })),
      ...duplicatePullHolds(snapshot?.items, pulls.duplicated, target),
    ],
  };
}

// The parent of a target issue, when that parent is a target record. A parent outside the target
// repository is not a parent in this closure, and the relation reasons hold the issue instead.
function parentNumberOf(index, number) {
  const parent = issueFor(index, number)?.parent;
  return isTargetReference(parent, index.target) ? numberOf(parent) : null;
}

// Null means the sub-issue list was never read. No rule may then treat the issue
// as childless, or as having only the children that point back at it.
function childNumbers(index, number) {
  const children = issueFor(index, number)?.children;
  if (!Array.isArray(children)) return null;
  const listed = children.filter((child) => isTargetReference(child, index.target)).map(numberOf);
  const pointing = index.order.filter((child) => parentNumberOf(index, child) === number);
  return [...new Set([...listed, ...pointing])];
}

// The reason one relation reference holds its issue, or null when it is a target relation.
function relationReason(index, label, reference) {
  const repository = referenceRepository(reference);
  const number = numberOf(reference);
  // ASSUMPTION: a reference that names no issue number has no identity either, so it is held as
  // unattributable instead of vanishing from the relations, where a missing child would go unseen.
  if (repository === null || number === null) return "repository identity missing";
  return isTargetRepository(repository, index.target) ? null : `${label} ${repository}#${number}`;
}

// The relations of one target issue that leave the target repository or cannot be attributed to
// it: its sub-issues, its parent (on the issue and in the Project field), and its linked pull requests.
function relationReasons(index, number) {
  const issue = issueFor(index, number);
  const item = itemFor(index, number);
  const children = Array.isArray(issue?.children) ? issue.children : [];
  const parents = [issue?.parent, fieldValue(item, "Parent issue")].filter(present);
  const reasons = [
    ...children.map((child) => relationReason(index, RELATION_LABELS.subIssue, child)),
    ...parents.map((parent) => relationReason(index, RELATION_LABELS.parent, parent)),
    ...linkedPullValues(item).map((pull) => relationReason(index, RELATION_LABELS.pullRequest, pull)),
  ];
  return [...new Set(reasons.filter((reason) => reason !== null))];
}

// Holds each target issue that a foreign or unattributable relation, or an unreadable Status,
// makes unsafe to judge. The plan runs these before any rule, so no rule can close such an issue.
function preflightHolds(index) {
  return index.numbers
    .map((number) => ({
      issue: number,
      reasons: [
        ...relationReasons(index, number),
        ...(statusUnreadable(itemFor(index, number)) ? [STATUS_NOT_STRING] : []),
      ],
    }))
    .filter(({ reasons }) => reasons.length > 0);
}

export {
  childNumbers,
  fieldValue,
  indexSnapshot,
  isTargetReference,
  isTargetRepository,
  issueFor,
  itemFor,
  itemPullNumbers,
  itemRepository,
  itemStatus,
  linkedPullValues,
  numberOf,
  parentNumberOf,
  preflightHolds,
  present,
  pullFor,
  qualifiedKey,
  recordRepository,
  referenceRepository,
  relationReasons,
  statusUnreadable,
};

import {
  FAILURE_CATEGORIES,
  TransportStopError,
  classifyTransportFailure,
  runTransport,
} from "../../../../lib/transport-policy.mjs";
import { collectingFrictionLog } from "./friction-log.mjs";

const PROJECT_FIELDS = Object.freeze([
  "Status",
  "Linked pull requests",
  "Repository",
  "Parent issue",
]);
const PROJECT_PAGE_SIZE = 100;
const PASSING_CHECK_BUCKETS = new Set(["pass", "skipping"]);

class QueueReadError extends Error {
  constructor(details, cause) {
    super(details.message, { cause });
    this.name = "QueueReadError";
    this.details = details;
  }
}

function fieldValue(item, name) {
  return (Array.isArray(item?.fields) ? item.fields : []).find((field) => field?.name === name)?.value;
}

function fieldPresent(item, name) {
  return Array.isArray(item?.fields) && item.fields.some((field) => field?.name === name);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function repositoryName(value) {
  if (typeof value === "string") return value;
  return firstDefined(value?.nameWithOwner, value?.full_name, value?.name);
}

function sameRepository(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

function itemRepository(item) {
  return repositoryName(
    item?.repository ?? fieldValue(item, "Repository") ?? item?.content?.repository,
  );
}

function itemIssueNumber(item) {
  return issueNumber(item?.issueNumber ?? item?.content?.number ?? item?.number);
}

function issueNumber(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return value?.number === undefined ? null : issueNumber(value.number);
}

function parentIssue(item, issue) {
  const projectParent = projectParentIssue(item);
  return projectParent === undefined ? issue?.parent ?? issue?.parentIssue ?? null : projectParent;
}

function projectParentIssue(item) {
  if (item?.parentIssue !== undefined) return item.parentIssue;
  const field = (Array.isArray(item?.fields) ? item.fields : []).find((candidate) => candidate?.name === "Parent issue");
  return field ? field.value ?? null : undefined;
}

function childIssues(issue) {
  const value = issue?.children ?? issue?.subIssues ?? issue?.sub_issues;
  return Array.isArray(value) ? value : [];
}

function childIssuesObserved(issue) {
  return issue && ["children", "subIssues", "sub_issues"].some((name) => Object.hasOwn(issue, name) && issue[name] !== undefined);
}

function parentIssueObserved(item, issue) {
  return fieldPresent(item, "Parent issue") ||
    Object.hasOwn(item ?? {}, "parentIssue") ||
    Object.hasOwn(issue ?? {}, "parent") ||
    Object.hasOwn(issue ?? {}, "parentIssue");
}

function parentIssueFieldObserved(item) {
  return projectParentIssue(item) !== undefined;
}

function linkedPullRequestsValue(item) {
  return item?.linkedPullRequests ?? fieldValue(item, "Linked pull requests") ?? item?.content?.linked_pull_requests;
}

function normalizedPullRequest(pullRequest) {
  const head = firstDefined(pullRequest?.head, {});
  const base = firstDefined(pullRequest?.base, {});
  const mergeCommit = firstDefined(pullRequest?.mergeCommit, pullRequest?.merge_commit);
  return {
    ...pullRequest,
    repository: repositoryName(pullRequest?.repository),
    state: firstDefined(pullRequest?.state),
    mergedAt: firstDefined(pullRequest?.mergedAt, pullRequest?.merged_at),
    headRepository: repositoryName(firstDefined(head.repository, pullRequest?.headRepository)),
    headRef: firstDefined(head.ref, pullRequest?.headRef),
    headSha: firstDefined(head.sha, pullRequest?.headSha, pullRequest?.head_sha),
    baseRef: firstDefined(base.ref, pullRequest?.baseRef, pullRequest?.base_ref),
    baseSha: firstDefined(base.sha, pullRequest?.baseSha, pullRequest?.base_sha),
    mergeCommitSha: firstDefined(mergeCommit?.oid, mergeCommit?.sha, pullRequest?.mergeCommitSha),
    requiredChecks: firstDefined(pullRequest?.requiredChecks),
  };
}

function linkedPullRequests(item) {
  const value = linkedPullRequestsValue(item);
  if (!Array.isArray(value)) return [];
  return value
    .map((pullRequest) => {
      const normalized = normalizedPullRequest(pullRequest);
      return {
        ...pullRequest,
        number: issueNumber(pullRequest),
        repository: firstDefined(normalized.repository),
        state: normalized.state,
        mergedAt: normalized.mergedAt,
        headSha: normalized.headSha,
        baseRef: normalized.baseRef,
      };
    })
    .filter(({ number }) => number !== null);
}

function projectStatus(item) {
  const value = item?.projectStatus ?? fieldValue(item, "Status") ?? null;
  return typeof value === "string" ? value : value?.name ?? null;
}

function pullRequestFields(reference, pullRequest) {
  const normalized = normalizedPullRequest(pullRequest);
  return {
    ...normalized,
    number: reference.number,
    repository: firstDefined(normalized.repository, reference.repository),
  };
}

function requireProvider(provider) {
  for (const method of ["listProjectItems", "readIssue", "readPullRequest"]) {
    if (typeof provider?.[method] !== "function") {
      throw new TypeError(`queue readback provider must implement ${method}().`);
    }
  }
}

function errorCategory(category) {
  if ([FAILURE_CATEGORIES.AUTHENTICATION, FAILURE_CATEGORIES.PERMISSION].includes(category)) return "entitlement";
  if ([FAILURE_CATEGORIES.MCP_RATE_LIMIT, FAILURE_CATEGORIES.REST_RATE_LIMIT].includes(category)) return "rate_limit";
  if (category === FAILURE_CATEGORIES.TIMEOUT) return "timeout";
  if (category === FAILURE_CATEGORIES.TRANSIENT) return "transient";
  return "provider";
}

function safeRequest(request) {
  if (!request || typeof request !== "object") return request;
  const copy = { ...request };
  if (copy.project && typeof copy.project === "object") {
    copy.project = {
      owner: copy.project.owner ?? null,
      number: copy.project.number ?? null,
      id: copy.project.id ?? null,
    };
  }
  return copy;
}

function failureDetails(operation, request, error, attempt, attempts, missingEvidence) {
  const fallbackAttempted = error instanceof TransportStopError && error.details?.restFailure !== undefined;
  const transportFailure = error instanceof TransportStopError
    ? error.details.restFailure ?? error.details.primaryFailure
    : error;
  const classified = classifyTransportFailure(transportFailure);
  return {
    operation,
    request: safeRequest(request),
    attempt,
    attempts,
    category: errorCategory(classified.category),
    code: classified.code,
    status: classified.status,
    message: classified.message,
    retryable: classified.retryable && !fallbackAttempted,
    retryAfterMs: classified.retryAfterMs,
    ...(classified.rateLimitResetAt === null ? {} : { rateLimitResetAt: classified.rateLimitResetAt }),
    missingEvidence: [...new Set(missingEvidence)],
  };
}

function providerFailure(result) {
  if (!result || typeof result !== "object") return null;
  if (result.isError || result.error || result.errorCode || result.status >= 400) {
    return result.error ?? result;
  }
  return null;
}

async function readProvider(provider, operation, request, evidence, missingEvidence = []) {
  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;
    try {
      const rest = provider.rest?.[operation];
      const endpoint = operation === "listProjectItems"
        ? `GET /users/${request.project.owner}/projectsV2/${request.project.number}/items`
        : operation === "readIssue"
          ? `GET /repos/${request.repository}/issues/${request.issueNumber}`
          : `GET /repos/${request.repository}/pulls/${request.pullNumber}`;
      const { value: result } = await runTransport({
        operation,
        request,
        primary: async () => {
          const value = await provider[operation](request);
          const failure = providerFailure(value);
          if (failure) throw failure;
          return value;
        },
        rest: typeof rest === "function"
          ? async () => {
              const value = await provider.rest[operation](request);
              const failure = providerFailure(value);
              if (failure) throw failure;
              return value;
            }
          : undefined,
        restEndpoint: endpoint,
        evidence: evidence.transportFailures,
      });
      return result;
    } catch (error) {
      const details = failureDetails(operation, request, error, attempt, attempt, missingEvidence);
      evidence.readAttempts.push(details);
      if (!details.retryable || attempt === 2) {
        evidence.readFailures.push(details);
        throw new QueueReadError(details, error);
      }
      evidence.retries.push(details);
    }
  }
  throw new Error("unreachable queue readback retry state");
}

function missingProjectFields(item) {
  const missing = [];
  if (itemRepository(item) === null) missing.push("Repository");
  if (itemIssueNumber(item) === null) missing.push("Issue number");
  if (projectStatus(item) === null) missing.push("Status");
  if (!parentIssueFieldObserved(item)) missing.push("Parent issue");
  if (
    linkedPullRequestsValue(item) === undefined &&
    Array.isArray(item?.fields) &&
    !fieldPresent(item, "Linked pull requests")
  ) {
    missing.push("Linked pull requests");
  }
  return missing;
}

function itemKey(item) {
  const id = item?.id ?? item?.node_id;
  if (id !== undefined && id !== null) return `id:${id}`;
  return `issue:${itemRepository(item) ?? "?"}#${itemIssueNumber(item) ?? "?"}`;
}

function itemSummary(item) {
  return {
    key: itemKey(item),
    repository: itemRepository(item),
    issueNumber: itemIssueNumber(item),
    status: projectStatus(item),
  };
}

function itemComparable(item) {
  return JSON.stringify({
    repository: itemRepository(item),
    issueNumber: itemIssueNumber(item),
    status: projectStatus(item),
    parentIssueNumber: issueNumber(parentIssue(item, null)),
    pullRequests: linkedPullRequests(item).map(({ number, repository, state, mergedAt, headSha, baseRef }) => ({
      number,
      repository,
      state,
      mergedAt,
      headSha,
      baseRef,
    })),
  });
}

async function readProjectItemsDetailed(provider, { project, repository, query = "is:issue", retryDelayMs = 0 }, evidence) {
  const items = [];
  const seenItems = new Map();
  const seenCursors = new Set();
  const invalidItems = [];
  let after;

  while (true) {
    const request = {
      project,
      query,
      fields: PROJECT_FIELDS,
      perPage: PROJECT_PAGE_SIZE,
    };
    if (after !== undefined) request.after = after;

    let page;
    try {
      page = await readProvider(provider, "listProjectItems", request, evidence, ["complete Project item pages"]);
    } catch (error) {
      return { items, invalidItems, duplicateConflicts: evidence.duplicateConflicts, error };
    }
    if (!Array.isArray(page?.items) || typeof page?.pageInfo?.hasNextPage !== "boolean") {
      const details = failureDetails(
        "listProjectItems",
        request,
        new Error("Project readback must include items and pageInfo.hasNextPage."),
        1,
        1,
        ["complete Project item page response"],
      );
      evidence.readAttempts.push(details);
      evidence.readFailures.push(details);
      return { items, invalidItems, duplicateConflicts: evidence.duplicateConflicts, error: new QueueReadError(details) };
    }

    for (const item of page.items) {
      const repositoryNameValue = itemRepository(item);
      if (repositoryNameValue === null) {
        invalidItems.push({ item: itemSummary(item), missingEvidence: missingProjectFields(item) });
        continue;
      }
      if (!sameRepository(repositoryNameValue, repository)) continue;

      const key = itemKey(item);
      const comparable = itemComparable(item);
      const semanticKey = `issue:${repositoryNameValue.toLowerCase()}#${itemIssueNumber(item) ?? "?"}`;
      const first = seenItems.get(key) ?? seenItems.get(semanticKey);
      if (first) {
        const duplicate = { key, first: first.summary, duplicate: itemSummary(item) };
        if (first.comparable !== comparable) {
          duplicate.conflict = true;
          evidence.duplicateConflicts.push(duplicate);
        } else {
          duplicate.conflict = false;
        }
        evidence.duplicates.push(duplicate);
        continue;
      }

      const missing = missingProjectFields(item);
      const summary = itemSummary(item);
      seenItems.set(key, { comparable, summary });
      seenItems.set(semanticKey, { comparable, summary });
      items.push(item);
      if (missing.length > 0) invalidItems.push({ item: summary, missingEvidence: missing });
    }

    if (!page.pageInfo.hasNextPage) return { items, invalidItems, duplicateConflicts: evidence.duplicateConflicts, error: null };
    const next = page.pageInfo.nextCursor;
    if (typeof next !== "string" || next.length === 0 || seenCursors.has(next)) {
      const details = failureDetails(
        "listProjectItems",
        request,
        new Error("Project readback reported another page without a stable cursor."),
        1,
        1,
        ["complete Project item pagination", "stable Project page cursor"],
      );
      evidence.readAttempts.push(details);
      evidence.readFailures.push(details);
      return { items, invalidItems, duplicateConflicts: evidence.duplicateConflicts, error: new QueueReadError(details) };
    }
    seenCursors.add(next);
    after = next;
    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelayMs, 1_000)));
  }
}

function issueState(issue) {
  return typeof issue?.state === "string" ? issue.state.toUpperCase() : null;
}

function activeCheckpoint(issue) {
  if (typeof issue?.activeCheckpoint === "boolean") return issue.activeCheckpoint;
  if (typeof issue?.active_checkpoint === "boolean") return issue.active_checkpoint;
  if (typeof issue?.checkpointActive === "boolean") return issue.checkpointActive;
  if (typeof issue?.checkpoint?.active === "boolean") return issue.checkpoint.active;
  return null;
}

function pullRequestKey(repository, number) {
  return `${(repository ?? "").toLowerCase()}#${number}`;
}

function pullRequestRepository(reference, repository) {
  if (reference.repository) return reference.repository;
  return repository;
}

function compareProjectRelationship(item, issue) {
  const mismatches = [];
  const itemState = typeof item?.content?.state === "string" ? item.content.state.toUpperCase() : null;
  const observedState = issueState(issue);
  if (itemState && observedState && itemState !== observedState) mismatches.push("issue state changed during read");
  if (item?.content?.number !== undefined && issue?.number !== undefined && Number(item.content.number) !== Number(issue.number)) {
    mismatches.push("issue number changed during read");
  }
  const projectParentNumber = issueNumber(projectParentIssue(item));
  const issueParentNumber = issueNumber(issue?.parent ?? issue?.parentIssue);
  if (projectParentNumber !== null && issueParentNumber !== null && projectParentNumber !== issueParentNumber) {
    mismatches.push("Parent issue relationship changed during read");
  }
  if (projectParentNumber === null && issueParentNumber !== null) {
    mismatches.push("Project Parent issue is missing the observed issue parent");
  }
  if (projectParentNumber !== null && issueParentNumber === null) {
    mismatches.push("issue parent is missing the observed Project Parent issue");
  }
  return mismatches;
}

function comparePullRequestRelationship(reference, pullRequest) {
  const mismatches = [];
  if (reference.repository && pullRequest.repository && !sameRepository(reference.repository, pullRequest.repository)) {
    mismatches.push("repository changed during read");
  }
  if (reference.state && pullRequest.state && reference.state.toUpperCase() !== pullRequest.state.toUpperCase()) {
    mismatches.push("state changed during read");
  }
  if (reference.mergedAt !== null && reference.mergedAt !== undefined && reference.mergedAt !== pullRequest.mergedAt) {
    mismatches.push("merge timestamp changed during read");
  }
  if (reference.headSha && pullRequest.headSha && reference.headSha !== pullRequest.headSha) {
    mismatches.push("head SHA changed during read");
  }
  if (reference.baseRef && pullRequest.baseRef && reference.baseRef !== pullRequest.baseRef) {
    mismatches.push("base ref changed during read");
  }
  return mismatches;
}

function addMissing(target, values) {
  for (const value of values) {
    if (value && !target.includes(value)) target.push(value);
  }
}

function createEvidence() {
  return {
    providerAvailable: true,
    readAttempts: [],
    readFailures: [],
    transportFailures: [],
    retries: [],
    duplicates: [],
    duplicateConflicts: [],
    staleRelationships: [],
    invalidItems: [],
    missingEvidence: [],
  };
}

function missingReadback(evidence, { operation, request, message, missingEvidence }) {
  const details = failureDetails(operation, request, new Error(message), 1, 1, missingEvidence);
  evidence.readAttempts.push(details);
  evidence.readFailures.push(details);
  return details;
}

async function readRelationship({ provider, operation, request, missingEvidence, missingMessage, evidence }) {
  try {
    const value = await readProvider(provider, operation, request, evidence, missingEvidence);
    if (value && typeof value === "object") return { value, failure: null };
  } catch (error) {
    return { value: null, failure: error.details ?? { operation, request } };
  }
  return {
    value: null,
    failure: missingReadback(evidence, { operation, request, message: missingMessage, missingEvidence }),
  };
}

async function readIssueRecord({ provider, repository, issueNumberValue, evidence }) {
  const request = { repository, issueNumber: issueNumberValue };
  const result = await readRelationship({
    provider,
    operation: "readIssue",
    request,
    missingEvidence: [`issue #${issueNumberValue}`],
    missingMessage: `Issue readback was missing #${issueNumberValue}.`,
    evidence,
  });
  return { issue: result.value, failure: result.failure };
}

async function readIssueRelationships({ provider, items, repository, evidence }) {
  const itemsByNumber = new Map(items.map((item) => [itemIssueNumber(item), item]).filter(([number]) => number !== null));
  const issues = new Map();
  const issueFailures = new Map();
  const pendingIssues = items.map(itemIssueNumber).filter((number) => number !== null);

  while (pendingIssues.length > 0) {
    const issueNumberValue = pendingIssues.shift();
    if (issues.has(issueNumberValue) || issueFailures.has(issueNumberValue)) continue;
    const { issue, failure } = await readIssueRecord({ provider, repository, issueNumberValue, evidence });
    if (failure) {
      issueFailures.set(issueNumberValue, failure);
      continue;
    }
    issues.set(issueNumberValue, issue);
    pendingIssues.push(...[parentIssue(null, issue), ...childIssues(issue)].map(issueNumber).filter((number) => number !== null && !issues.has(number) && !issueFailures.has(number)));
    for (const item of items.filter((candidate) => itemIssueNumber(candidate) === issueNumberValue)) {
      const mismatches = compareProjectRelationship(item, issue);
      if (mismatches.length > 0) {
        evidence.staleRelationships.push({ kind: "issue", issueNumber: issueNumberValue, mismatches });
      }
    }
  }
  return { itemsByNumber, issues, issueFailures };
}

function pullRequestReferences(items, repository) {
  const references = new Map();
  for (const item of items) {
    for (const reference of linkedPullRequests(item)) {
      const key = pullRequestKey(reference.repository ?? repository, reference.number);
      references.set(key, reference);
    }
  }
  return references;
}

async function readPullRequestRecord({ provider, repository, reference, evidence }) {
  const request = { repository: reference.repository ?? repository, pullNumber: reference.number };
  const result = await readRelationship({
    provider,
    operation: "readPullRequest",
    request,
    missingEvidence: [`pull request ${request.repository}#${request.pullNumber}`],
    missingMessage: `Pull request readback was missing #${reference.number}.`,
    evidence,
  });
  return { pullRequest: result.value, failure: result.failure, request };
}

async function readPullRequestRelationships({ provider, items, repository, evidence }) {
  const pullRequests = new Map();
  const pullRequestFailures = new Map();
  for (const [key, reference] of pullRequestReferences(items, repository)) {
    const { pullRequest, failure, request } = await readPullRequestRecord({ provider, repository, reference, evidence });
    if (failure) {
      pullRequestFailures.set(key, failure);
      continue;
    }
    const normalized = pullRequestFields(reference, pullRequest);
    pullRequests.set(key, normalized);
    const mismatches = comparePullRequestRelationship(reference, normalized);
    if (mismatches.length > 0) {
      evidence.staleRelationships.push({
        kind: "pull_request",
        number: reference.number,
        repository: request.repository,
        mismatches,
      });
    }
  }
  return { pullRequests, pullRequestFailures };
}

function itemEvidenceMissing(item, number) {
  return [
    ...(number === null ? ["issue number"] : []),
    ...(projectStatus(item) === null ? [`Project item #${number ?? "?"} Status`] : []),
  ];
}

function issueFailureEvidenceMissing(number, issueFailures) {
  const failure = issueFailures.get(number);
  return failure ? failure.missingEvidence ?? [`issue #${number}`] : [];
}

function missingIssueEvidence(number, issue, issueFailures) {
  return issue === null && !issueFailures.has(number) ? [`issue #${number}`] : [];
}

function issueFieldEvidenceMissing(number, issue) {
  if (!issue) return [];
  return [
    ...(issue.number === undefined ? [`issue #${number} number`] : []),
    ...(issueState(issue) === null ? [`issue #${number} state`] : []),
  ];
}

function issueRelationshipEvidenceMissing(item, number, issue) {
  if (!issue) return [];
  return [
    ...(!childIssuesObserved(issue) ? [`issue #${number} child relationship`] : []),
    ...(!parentIssueObserved(item, issue) ? [`issue #${number} parent relationship`] : []),
  ];
}

function parentRelationshipEvidenceMissing(number, issue, parentIssueNumber) {
  if (!issue) return [];
  if (parentIssueNumber === null) return [];
  const observedParentNumber = issueNumber(parentIssue(null, issue));
  if (observedParentNumber === null) return [];
  if (parentIssueNumber === observedParentNumber) return [];
  return [`parent relationship for issue #${number}`];
}

function parentItemEvidenceMissing(parentIssueNumber, itemsByNumber) {
  if (parentIssueNumber === null || itemsByNumber.has(parentIssueNumber)) return [];
  return [`parent issue #${parentIssueNumber} Project item`];
}

function unobservedChildEvidence(issue, itemsByNumber) {
  return childIssues(issue)
    .map(issueNumber)
    .filter((childNumber) => childNumber !== null && !itemsByNumber.has(childNumber))
    .map((childNumber) => `child issue #${childNumber} Project item`);
}

function recordIssueEvidence(item, { itemsByNumber, issues, issueFailures, evidence }) {
  const number = itemIssueNumber(item);
  const issue = issues.get(number) ?? null;
  const parent = parentIssue(item, issue);
  const parentIssueNumber = issueNumber(parent);
  const itemInvalid = evidence.invalidItems.find(({ item: summary }) => summary.key === itemKey(item));
  const missing = [
    ...(itemInvalid?.missingEvidence ?? []),
    ...itemEvidenceMissing(item, number),
    ...issueFailureEvidenceMissing(number, issueFailures),
    ...missingIssueEvidence(number, issue, issueFailures),
    ...parentItemEvidenceMissing(parentIssueNumber, itemsByNumber),
    ...issueFieldEvidenceMissing(number, issue),
    ...issueRelationshipEvidenceMissing(item, number, issue),
    ...parentRelationshipEvidenceMissing(number, issue, parentIssueNumber),
    ...unobservedChildEvidence(issue, itemsByNumber),
  ];
  return { number, issue, parent, parentIssueNumber, missing };
}

function pullRequestEvidence(reference, { repository, pullRequests, pullRequestFailures }) {
  const key = pullRequestKey(pullRequestRepository(reference, repository), reference.number);
  const failure = pullRequestFailures.get(key);
  const missing = failure?.missingEvidence;
  if (missing) return { pullRequest: pullRequests.get(key), failure, missing };
  return { pullRequest: pullRequests.get(key), failure, missing: failure ? [`pull request ${key}`] : [] };
}

function recordPullRequestEvidence(item, context) {
  const pulls = [];
  const failures = [];
  const missing = [];
  for (const reference of linkedPullRequests(item)) {
    const evidence = pullRequestEvidence(reference, context);
    if (evidence.pullRequest) pulls.push(evidence.pullRequest);
    if (evidence.failure) failures.push(evidence.failure);
    addMissing(missing, evidence.missing);
  }
  return { pulls, failures, missing };
}

function buildRecord(item, context) {
  const issueEvidence = recordIssueEvidence(item, context);
  const pullRequestEvidence = recordPullRequestEvidence(item, context);
  const staleRelationships = context.evidence.staleRelationships.filter((entry) => {
    if (entry.kind === "issue") return entry.issueNumber === issueEvidence.number;
    return linkedPullRequests(item).some((reference) => reference.number === entry.number);
  });
  const missing = [...issueEvidence.missing, ...pullRequestEvidence.missing];
  if (staleRelationships.length > 0) missing.push("relationship/head evidence changed during read");
  return {
    issueNumber: issueEvidence.number,
    parentIssue: issueEvidence.parent,
    parentIssueNumber: issueEvidence.parentIssueNumber,
    childIssues: childIssues(issueEvidence.issue),
    projectStatus: projectStatus(item),
    parentIssueFieldObserved: parentIssueFieldObserved(item),
    issue: issueEvidence.issue,
    pullRequests: pullRequestEvidence.pulls,
    pullRequestFailures: pullRequestEvidence.failures,
    staleRelationships,
    missingEvidence: [...new Set(missing)],
    projectItem: item,
  };
}

function buildRecords(items, context) {
  return items.map((item) => buildRecord(item, context));
}

function doneStatus(status) {
  return typeof status === "string" && status.toLowerCase() === "done";
}

function reconcileProjectCounts(items, records) {
  const snapshotItems = Array.isArray(items) ? items : [];
  const snapshotRecords = Array.isArray(records) ? records : [];
  const parents = snapshotRecords.filter(({ parentIssueNumber }) => parentIssueNumber === null);
  const children = snapshotRecords.filter(({ parentIssueNumber }) => parentIssueNumber !== null);
  const missingParentFields = snapshotRecords
    .filter(({ parentIssueFieldObserved }) => parentIssueFieldObserved !== true)
    .map(({ issueNumber }) => `Project item #${issueNumber ?? "?"} Parent issue`);
  const missingRecordCounts = snapshotItems.length === snapshotRecords.length
    ? []
    : [`raw Project items (${snapshotItems.length}) and reconciled records (${snapshotRecords.length}) differ`];
  const missingEvidence = [...new Set([...missingParentFields, ...missingRecordCounts])];
  const counts = {
    rawItems: snapshotItems.length,
    parentItems: parents.length,
    childItems: children.length,
    parentDoneItems: parents.filter(({ projectStatus }) => doneStatus(projectStatus)).length,
    childDoneItems: children.filter(({ projectStatus }) => doneStatus(projectStatus)).length,
  };
  return {
    ...counts,
    balanced: missingEvidence.length === 0 && counts.rawItems === counts.parentItems + counts.childItems,
    missingEvidence,
  };
}

function finalizeEvidence(evidence, records) {
  evidence.providerAvailable = evidence.readFailures.length === 0;
  evidence.missingEvidence = [
    ...new Set([
      ...evidence.missingEvidence,
      ...evidence.invalidItems.flatMap(({ missingEvidence }) => missingEvidence),
      ...records.flatMap((record) => record.missingEvidence),
      ...evidence.duplicateConflicts.map(({ key }) => `conflicting duplicate Project item ${key}`),
    ]),
  ];
}

async function readQueueSnapshot({ provider, project, repository, query, defaultBranch, retryDelayMs = 0 }) {
  requireProvider(provider);
  const repositoryNameValue = repositoryName(repository);
  const resolvedDefaultBranch = defaultBranch ?? repository?.defaultBranch ?? project?.defaultBranch ?? null;
  const evidence = createEvidence();
  if (!repositoryNameValue) evidence.missingEvidence.push("target repository identity");
  const projectResult = await readProjectItemsDetailed(provider, { project, repository: repositoryNameValue, query, retryDelayMs }, evidence);
  evidence.invalidItems.push(...projectResult.invalidItems);
  if (projectResult.error?.details) addMissing(evidence.missingEvidence, projectResult.error.details.missingEvidence);
  const items = projectResult.items;
  const issueRead = await readIssueRelationships({ provider, items, repository: repositoryNameValue, evidence });
  const pullRequestRead = await readPullRequestRelationships({ provider, items, repository: repositoryNameValue, evidence });
  const records = buildRecords(items, { ...issueRead, ...pullRequestRead, repository: repositoryNameValue, evidence });
  const counts = reconcileProjectCounts(items, records);
  addMissing(evidence.missingEvidence, counts.missingEvidence);
  finalizeEvidence(evidence, records);
  return { project, repository: repositoryNameValue, defaultBranch: resolvedDefaultBranch, items, records, counts, issues: [...issueRead.issues.values()], pullRequests: [...pullRequestRead.pullRequests.values()], evidence, readFailures: evidence.readFailures, missingEvidence: evidence.missingEvidence };
}

function normalizedStatus(status) {
  return typeof status === "string" ? status : null;
}

function mergedPullRequest(pullRequest) {
  return Boolean(pullRequest?.mergedAt) || String(pullRequest?.state ?? "").toUpperCase() === "MERGED";
}

function checkBucket(check) {
  const bucket = check?.bucket ?? check?.conclusion ?? check?.status ?? check?.state;
  if (typeof bucket !== "string") return null;
  const normalized = bucket.toLowerCase();
  if (["success", "passed", "pass", "skipped", "neutral"].includes(normalized)) return "pass";
  if (["pending", "queued", "in_progress"].includes(normalized)) return "pending";
  if (["failure", "failed", "fail", "cancelled", "cancel"].includes(normalized)) return "fail";
  return normalized;
}

function requiredChecksComplete(value) {
  const checks = Array.isArray(value) ? value : value?.checks;
  if (!Array.isArray(checks) || checks.length === 0) return { complete: false, reason: "required checks missing or empty" };
  const invalid = checks.filter((check) => !PASSING_CHECK_BUCKETS.has(checkBucket(check)));
  if (invalid.length > 0) return { complete: false, reason: "required checks are incomplete or failed" };
  if (value && !Array.isArray(value) && value.complete === false) return { complete: false, reason: "required checks are incomplete" };
  return { complete: true };
}

function trustedHead(pullRequest) {
  const headSha = pullRequest?.headSha;
  const trustedHeadSha = pullRequest?.trustedHeadSha ?? pullRequest?.trusted_head_sha;
  const explicitTrust = pullRequest?.trustedHead ?? pullRequest?.headTrusted ?? pullRequest?.head_trusted;
  if (explicitTrust === false || (trustedHeadSha && trustedHeadSha !== headSha)) return false;
  return explicitTrust === true || Boolean(trustedHeadSha && trustedHeadSha === headSha);
}

function mergedEvidenceReasons(records, context, mergedPullRequests) {
  const reasons = [];
  const repository = repositoryName(context.repository);
  if (!repository) reasons.push("target repository identity missing");
  if (!context.defaultBranch) reasons.push("default base branch missing");
  if (mergedPullRequests.length !== 1) reasons.push("merged delivery relationship is missing or duplicated");
  for (const pullRequest of mergedPullRequests) {
    if (!sameRepository(pullRequest.headRepository, repository)) reasons.push("pull request head repository is not the target repository");
    if (!context.defaultBranch || pullRequest.baseRef !== context.defaultBranch) reasons.push("pull request base is not the default branch");
    if (!pullRequest.headRef || !pullRequest.headSha) reasons.push("trusted pull request head is missing");
    if (!trustedHead(pullRequest)) reasons.push("trusted pull request head evidence is missing or stale");
    if (!pullRequest.mergeCommitSha) reasons.push("merge commit is missing");
    const checks = requiredChecksComplete(pullRequest.requiredChecks);
    if (!checks.complete) reasons.push(checks.reason);
  }
  for (const record of records) {
    if (!record.issue || issueState(record.issue) !== "CLOSED") reasons.push(`issue #${record.issueNumber} is not closed`);
    if (record.projectStatus !== "Done") reasons.push(`Project item #${record.issueNumber} is not Done`);
    const checkpoint = activeCheckpoint(record.issue);
    if (checkpoint !== false) reasons.push(`active checkpoint for issue #${record.issueNumber} is not explicitly false`);
  }
  return [...new Set(reasons)];
}

function defaultQueueDecision(records, context = {}) {
  if (!Array.isArray(records) || records.length === 0) return { kind: "hold", eligible: false, reasons: ["delivery record missing"] };
  const reasons = [...new Set(records.flatMap((record) => record.missingEvidence ?? []))];
  const statuses = records.map(({ projectStatus }) => normalizedStatus(projectStatus));
  const uniqueStatuses = [...new Set(statuses.filter(Boolean))];
  if (statuses.some((status) => status === null)) reasons.push("Project status missing");
  if (uniqueStatuses.length > 1) reasons.push(`Project status drift: ${uniqueStatuses.join(", ")}`);
  const recordNumbers = new Set(records.map(({ issueNumber }) => issueNumber));
  if (records.some((record) => record.parentIssueNumber !== null && (record.orphan || !recordNumbers.has(record.parentIssueNumber)))) {
    reasons.push("orphaned parent/child relationship");
  }
  if (records.some((record) => record.staleRelationships?.length > 0)) reasons.push("relationship/head evidence changed during read");

  const pullRequests = records.flatMap(({ pullRequests: linked }) => linked ?? []);
  const merged = pullRequests.filter(mergedPullRequest);
  const open = pullRequests.filter((pullRequest) => String(pullRequest?.state ?? "").toUpperCase() === "OPEN");
  if (open.length > 0) reasons.push("open implementation pull request remains active");
  if (pullRequests.some((pullRequest) => !pullRequest?.state)) reasons.push("pull request state missing");
  if (records.some((record) => activeCheckpoint(record.issue) === true)) reasons.push("active implementation checkpoint remains");
  if (pullRequests.some((pullRequest) => String(pullRequest?.state ?? "").toUpperCase() === "CLOSED" && !mergedPullRequest(pullRequest))) {
    reasons.push("closed pull request is not a verified merge");
  }
  if (pullRequests.some((pullRequest) => !mergedPullRequest(pullRequest) && String(pullRequest?.state ?? "").toUpperCase() !== "CLOSED")) {
    reasons.push("pull request outcome is unresolved");
  }

  if (merged.length > 0) {
    reasons.push(...mergedEvidenceReasons(records, context, merged));
    if (reasons.length > 0) return { kind: "hold", eligible: false, reasons: [...new Set(reasons)] };
    return { kind: "complete", eligible: false, status: "Done", reasons: [] };
  }

  if (reasons.length > 0) return { kind: "hold", eligible: false, reasons: [...new Set(reasons)] };
  if (collectingFrictionLog(records, context.today)) {
    return { kind: "hold", eligible: false, reasons: ["friction log still collecting entries"] };
  }
  if (uniqueStatuses.length !== 1 || !["Todo", "Backlog"].includes(uniqueStatuses[0])) {
    return { kind: "hold", eligible: false, reasons: ["Project status is not a queue status"] };
  }
  if (records.some((record) => record.issue === null)) return { kind: "hold", eligible: false, reasons: ["issue readback missing"] };
  return { kind: "eligible", eligible: true, status: uniqueStatuses[0], reasons: [] };
}

function recordOrphaned(record, records) {
  return record.parentIssueNumber !== null && !records.some(({ issueNumber }) => issueNumber === record.parentIssueNumber);
}

function selectQueueItem(snapshot, classify = defaultQueueDecision) {
  if (!snapshot || snapshot.readFailures?.length > 0 || snapshot.evidence?.readFailures?.length > 0) return null;
  if (snapshot.evidence?.invalidItems?.length > 0 || snapshot.evidence?.duplicateConflicts?.length > 0) return null;
  const records = (snapshot.records ?? []).map((record, index, allRecords) => ({
    ...record,
    orphan: recordOrphaned(record, allRecords),
    _queueOrder: index,
  }));
  const groups = new Map();
  for (const record of records) {
    if (record.issueNumber === null) continue;
    const root = record.parentIssueNumber ?? record.issueNumber;
    const group = groups.get(root) ?? { rootIssueNumber: root, records: [], _queueOrder: record._queueOrder };
    group.records.push(record);
    groups.set(root, group);
  }
  const candidates = [...groups.values()]
    .map((group) => ({ ...group, decision: classify(group.records, snapshot) }))
    .filter(({ decision }) => decision?.eligible)
    .sort((left, right) => {
      const rank = { Todo: 0, Backlog: 1 };
      return (rank[left.decision.status] ?? 2) - (rank[right.decision.status] ?? 2) || left._queueOrder - right._queueOrder;
    });
  return candidates[0] ?? null;
}

export {
  PROJECT_FIELDS,
  defaultQueueDecision,
  reconcileProjectCounts,
  readQueueSnapshot,
  selectQueueItem,
};

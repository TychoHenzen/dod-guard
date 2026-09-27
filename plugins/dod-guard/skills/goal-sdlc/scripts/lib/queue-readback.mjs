const PROJECT_FIELDS = Object.freeze([
  "Status",
  "Linked pull requests",
  "Repository",
  "Parent issue",
]);
const PROJECT_PAGE_SIZE = 100;
const PASSING_CHECK_BUCKETS = new Set(["pass", "skipping"]);
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "econnreset",
  "eai_again",
  "etimedout",
  "timeout",
  "timeout_error",
  "temporarily_unavailable",
]);

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

function repositoryName(value) {
  if (typeof value === "string") return value;
  return value?.nameWithOwner ?? value?.full_name ?? value?.name ?? null;
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
  return item?.parentIssue ?? fieldValue(item, "Parent issue") ?? issue?.parent ?? issue?.parentIssue ?? null;
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

function linkedPullRequestsValue(item) {
  return item?.linkedPullRequests ?? fieldValue(item, "Linked pull requests") ?? item?.content?.linked_pull_requests;
}

function linkedPullRequests(item) {
  const value = linkedPullRequestsValue(item);
  if (!Array.isArray(value)) return [];
  return value
    .map((pullRequest) => ({
      ...pullRequest,
      number: issueNumber(pullRequest),
      repository: repositoryName(pullRequest?.repository) ?? null,
      state: pullRequest?.state ?? null,
      mergedAt: pullRequest?.mergedAt ?? pullRequest?.merged_at ?? null,
      headSha: pullRequest?.headSha ?? pullRequest?.head_sha ?? pullRequest?.head?.sha ?? null,
      baseRef: pullRequest?.baseRef ?? pullRequest?.base_ref ?? pullRequest?.base?.ref ?? null,
    }))
    .filter(({ number }) => number !== null);
}

function projectStatus(item) {
  const value = item?.projectStatus ?? fieldValue(item, "Status") ?? null;
  return typeof value === "string" ? value : value?.name ?? null;
}

function pullRequestFields(reference, pullRequest) {
  const head = pullRequest?.head ?? {};
  const base = pullRequest?.base ?? {};
  const mergeCommit = pullRequest?.mergeCommit ?? pullRequest?.merge_commit;
  return {
    ...pullRequest,
    number: reference.number,
    repository: repositoryName(pullRequest?.repository) ?? reference.repository,
    state: pullRequest?.state ?? null,
    mergedAt: pullRequest?.mergedAt ?? pullRequest?.merged_at ?? null,
    headRepository: repositoryName(head.repository ?? pullRequest?.headRepository),
    headRef: head.ref ?? pullRequest?.headRef ?? null,
    headSha: head.sha ?? pullRequest?.headSha ?? pullRequest?.head_sha ?? null,
    baseRef: base.ref ?? pullRequest?.baseRef ?? null,
    baseSha: base.sha ?? pullRequest?.baseSha ?? pullRequest?.base_sha ?? null,
    mergeCommitSha: mergeCommit?.oid ?? mergeCommit?.sha ?? pullRequest?.mergeCommitSha ?? null,
    requiredChecks: pullRequest?.requiredChecks ?? null,
  };
}

function requireProvider(provider) {
  for (const method of ["listProjectItems", "readIssue", "readPullRequest"]) {
    if (typeof provider?.[method] !== "function") {
      throw new TypeError(`queue readback provider must implement ${method}().`);
    }
  }
}

function errorStatus(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return Number.isInteger(Number(status)) ? Number(status) : null;
}

function errorCode(error) {
  const code = error?.code ?? error?.response?.data?.code;
  return typeof code === "string" ? code.toLowerCase() : null;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error?.message === "string") return error.message;
  if (error && typeof error === "object") return JSON.stringify(error);
  return String(error);
}

function errorCategory(error) {
  const status = errorStatus(error);
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  if (status === 401 || status === 403 || /forbidden|entitlement|unauthori[sz]ed|\b401\b|\b403\b/.test(message)) return "entitlement";
  if (status === 429 || /rate.?limit|secondary.?limit|too many requests|\b429\b/.test(message)) return "rate_limit";
  if (status === 408 || RETRYABLE_ERROR_CODES.has(code) || /timed? ?out|timeout|\b408\b/.test(message)) return "timeout";
  if (RETRYABLE_STATUS_CODES.has(status) || RETRYABLE_ERROR_CODES.has(code)) return "transient";
  return "provider";
}

function retryableError(error) {
  const category = errorCategory(error);
  return category === "timeout" || category === "transient";
}

function retryAfterMs(error) {
  const value = error?.retryAfterMs ?? error?.retry_after_ms ?? error?.response?.headers?.["retry-after"];
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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
  const category = errorCategory(error);
  return {
    operation,
    request: safeRequest(request),
    attempt,
    attempts,
    category,
    code: errorCode(error),
    status: errorStatus(error),
    message: errorMessage(error),
    retryable: retryableError(error),
    retryAfterMs: retryAfterMs(error),
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
      const result = await provider[operation](request);
      const failure = providerFailure(result);
      if (failure) throw failure;
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

async function readProjectItems(provider, options = {}) {
  requireProvider(provider);
  const evidence = { readAttempts: [], readFailures: [], retries: [], duplicates: [], duplicateConflicts: [] };
  const result = await readProjectItemsDetailed(provider, options, evidence);
  return result.items;
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

function compareProjectRelationship(item, issue) {
  const mismatches = [];
  const itemState = typeof item?.content?.state === "string" ? item.content.state.toUpperCase() : null;
  const observedState = issueState(issue);
  if (itemState && observedState && itemState !== observedState) mismatches.push("issue state changed during read");
  if (item?.content?.number !== undefined && issue?.number !== undefined && Number(item.content.number) !== Number(issue.number)) {
    mismatches.push("issue number changed during read");
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

async function readQueueSnapshot({ provider, project, repository, query, defaultBranch, retryDelayMs = 0 }) {
  requireProvider(provider);
  const repositoryNameValue = repositoryName(repository);
  const resolvedDefaultBranch = defaultBranch ?? repository?.defaultBranch ?? project?.defaultBranch ?? null;
  const evidence = {
    providerAvailable: true,
    readAttempts: [],
    readFailures: [],
    retries: [],
    duplicates: [],
    duplicateConflicts: [],
    staleRelationships: [],
    invalidItems: [],
    missingEvidence: [],
  };
  if (!repositoryNameValue) evidence.missingEvidence.push("target repository identity");
  const projectResult = await readProjectItemsDetailed(
    provider,
    { project, repository: repositoryNameValue, query, retryDelayMs },
    evidence,
  );
  evidence.invalidItems.push(...projectResult.invalidItems);
  if (projectResult.error && projectResult.error.details) addMissing(evidence.missingEvidence, projectResult.error.details.missingEvidence);

  const items = projectResult.items;
  const itemsByNumber = new Map(
    items.map((item) => [itemIssueNumber(item), item]).filter(([number]) => number !== null),
  );
  const issues = new Map();
  const issueFailures = new Map();
  const pendingIssues = items.map(itemIssueNumber).filter((number) => number !== null);

  while (pendingIssues.length > 0) {
    const issueNumberValue = pendingIssues.shift();
    if (issues.has(issueNumberValue) || issueFailures.has(issueNumberValue)) continue;
    const request = { repository: repositoryNameValue, issueNumber: issueNumberValue };
    let issue;
    try {
      issue = await readProvider(provider, "readIssue", request, evidence, [`issue #${issueNumberValue}`]);
    } catch (error) {
      issueFailures.set(issueNumberValue, error.details ?? { operation: "readIssue", request });
      continue;
    }
    if (!issue || typeof issue !== "object") {
      const details = failureDetails(
        "readIssue",
        request,
        new Error(`Issue readback was missing #${issueNumberValue}.`),
        1,
        1,
        [`issue #${issueNumberValue}`],
      );
      evidence.readAttempts.push(details);
      evidence.readFailures.push(details);
      issueFailures.set(issueNumberValue, details);
      continue;
    }
    issues.set(issueNumberValue, issue);
    const related = [parentIssue(null, issue), ...childIssues(issue)]
      .map(issueNumber)
      .filter((number) => number !== null && !issues.has(number) && !issueFailures.has(number));
    pendingIssues.push(...related);

    for (const item of items.filter((candidate) => itemIssueNumber(candidate) === issueNumberValue)) {
      const mismatches = compareProjectRelationship(item, issue);
      if (mismatches.length > 0) {
        evidence.staleRelationships.push({
          kind: "issue",
          issueNumber: issueNumberValue,
          mismatches,
        });
      }
    }
  }

  const pullRequests = new Map();
  const pullRequestFailures = new Map();
  const pullRequestReferences = new Map();
  for (const item of items) {
    for (const reference of linkedPullRequests(item)) {
      const key = pullRequestKey(reference.repository ?? repositoryNameValue, reference.number);
      pullRequestReferences.set(key, reference);
    }
  }
  for (const [key, reference] of pullRequestReferences) {
    const request = {
      repository: reference.repository ?? repositoryNameValue,
      pullNumber: reference.number,
    };
    let pullRequest;
    try {
      pullRequest = await readProvider(provider, "readPullRequest", request, evidence, [
        `pull request ${request.repository}#${request.pullNumber}`,
      ]);
    } catch (error) {
      pullRequestFailures.set(key, error.details ?? { operation: "readPullRequest", request });
      continue;
    }
    if (!pullRequest || typeof pullRequest !== "object") {
      const details = failureDetails(
        "readPullRequest",
        request,
        new Error(`Pull request readback was missing #${reference.number}.`),
        1,
        1,
        [`pull request ${request.repository}#${request.pullNumber}`],
      );
      evidence.readAttempts.push(details);
      evidence.readFailures.push(details);
      pullRequestFailures.set(key, details);
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

  const records = items.map((item) => {
    const number = itemIssueNumber(item);
    const issue = issues.get(number) ?? null;
    const parent = parentIssue(item, issue);
    const parentIssueNumber = issueNumber(parent);
    const missing = [];
    const itemInvalid = evidence.invalidItems.find(({ item: summary }) => summary.key === itemKey(item));
    addMissing(missing, itemInvalid?.missingEvidence ?? []);
    if (number === null) missing.push("issue number");
    if (projectStatus(item) === null) missing.push(`Project item #${number ?? "?"} Status`);
    if (issueFailures.has(number)) addMissing(missing, issueFailures.get(number).missingEvidence ?? [`issue #${number}`]);
    if (issue === null && !issueFailures.has(number)) missing.push(`issue #${number}`);
    if (parentIssueNumber !== null && !itemsByNumber.has(parentIssueNumber)) {
      missing.push(`parent issue #${parentIssueNumber} Project item`);
    }
    if (issue) {
      if (issue.number === undefined) missing.push(`issue #${number} number`);
      if (issueState(issue) === null) missing.push(`issue #${number} state`);
      if (!childIssuesObserved(issue)) missing.push(`issue #${number} child relationship`);
      if (!parentIssueObserved(item, issue)) missing.push(`issue #${number} parent relationship`);
      const observedParentNumber = issueNumber(issue.parent ?? issue.parentIssue);
      if (parentIssueNumber !== null && observedParentNumber !== null && parentIssueNumber !== observedParentNumber) {
        missing.push(`parent relationship for issue #${number}`);
      }
      const unobservedChildren = childIssues(issue)
        .map(issueNumber)
        .filter((childNumber) => childNumber !== null && !itemsByNumber.has(childNumber));
      addMissing(missing, unobservedChildren.map((childNumber) => `child issue #${childNumber} Project item`));
    }
    const pulls = [];
    const pullFailures = [];
    for (const reference of linkedPullRequests(item)) {
      const key = pullRequestKey(reference.repository ?? repositoryNameValue, reference.number);
      const pullRequest = pullRequests.get(key);
      if (pullRequest) pulls.push(pullRequest);
      if (pullRequestFailures.has(key)) {
        const failure = pullRequestFailures.get(key);
        pullFailures.push(failure);
        addMissing(missing, failure.missingEvidence ?? [`pull request ${key}`]);
      }
    }
    const staleRelationships = evidence.staleRelationships.filter((entry) => {
      if (entry.kind === "issue") return entry.issueNumber === number;
      return linkedPullRequests(item).some((reference) => reference.number === entry.number);
    });
    if (staleRelationships.length > 0) missing.push("relationship/head evidence changed during read");
    return {
      issueNumber: number,
      parentIssue: parent,
      parentIssueNumber,
      childIssues: childIssues(issue),
      projectStatus: projectStatus(item),
      issue,
      pullRequests: pulls,
      pullRequestFailures: pullFailures,
      staleRelationships,
      missingEvidence: [...new Set(missing)],
      projectItem: item,
    };
  });

  evidence.providerAvailable = evidence.readFailures.length === 0;
  evidence.missingEvidence = [
    ...new Set([
      ...evidence.missingEvidence,
      ...evidence.invalidItems.flatMap(({ missingEvidence }) => missingEvidence),
      ...records.flatMap((record) => record.missingEvidence),
      ...evidence.duplicateConflicts.map(({ key }) => `conflicting duplicate Project item ${key}`),
    ]),
  ];
  return {
    project,
    repository: repositoryNameValue,
    defaultBranch: resolvedDefaultBranch,
    items,
    records,
    issues: [...issues.values()],
    pullRequests: [...pullRequests.values()],
    evidence,
    readFailures: evidence.readFailures,
    missingEvidence: evidence.missingEvidence,
  };
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
  readProjectItems,
  readQueueSnapshot,
  selectQueueItem,
};

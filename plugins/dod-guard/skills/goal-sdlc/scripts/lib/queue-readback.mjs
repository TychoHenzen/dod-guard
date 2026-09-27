const PROJECT_FIELDS = Object.freeze([
  "Status",
  "Linked pull requests",
  "Repository",
  "Parent issue",
]);
const PROJECT_PAGE_SIZE = 100;

function fieldValue(item, name) {
  return item?.fields?.find((field) => field?.name === name)?.value;
}

function repositoryName(value) {
  if (typeof value === "string") return value;
  return value?.nameWithOwner ?? value?.full_name ?? value?.name ?? null;
}

function itemRepository(item) {
  return repositoryName(
    item?.repository ?? fieldValue(item, "Repository") ?? item?.content?.repository,
  );
}

function itemIssueNumber(item) {
  return item?.issueNumber ?? item?.content?.number ?? item?.number ?? null;
}

function issueNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return value?.number ?? null;
}

function parentIssue(item, issue) {
  return item?.parentIssue ?? fieldValue(item, "Parent issue") ?? issue?.parent ?? issue?.parentIssue ?? null;
}

function childIssues(issue) {
  return issue?.children ?? issue?.subIssues ?? issue?.sub_issues ?? [];
}

function linkedPullRequests(item) {
  const value = item?.linkedPullRequests ?? fieldValue(item, "Linked pull requests") ?? item?.content?.linked_pull_requests;
  if (!Array.isArray(value)) return [];
  return value
    .map((pullRequest) => ({
      number: issueNumber(pullRequest),
      repository: repositoryName(pullRequest?.repository) ?? null,
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
    repository: reference.repository ?? pullRequest?.repository,
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

async function readProjectItems(provider, { project, repository, query = "is:issue" }) {
  const items = [];
  const seen = new Set();
  let after;

  while (true) {
    const request = {
      project,
      query,
      fields: PROJECT_FIELDS,
      perPage: PROJECT_PAGE_SIZE,
    };
    if (after !== undefined) request.after = after;
    const page = await provider.listProjectItems(request);
    if (!Array.isArray(page?.items) || typeof page?.pageInfo?.hasNextPage !== "boolean") {
      throw new Error("Project readback must include items and pageInfo.hasNextPage.");
    }

    for (const item of page.items) {
      const itemId = item?.id ?? `${itemRepository(item)}#${itemIssueNumber(item)}`;
      if (itemRepository(item) === repository && !seen.has(itemId)) {
        seen.add(itemId);
        items.push(item);
      }
    }

    if (!page.pageInfo.hasNextPage) return items;
    const next = page.pageInfo.nextCursor;
    if (typeof next !== "string" || next.length === 0 || next === after) {
      throw new Error("Project readback reported another page without a stable cursor.");
    }
    after = next;
  }
}

async function readQueueSnapshot({ provider, project, repository, query }) {
  requireProvider(provider);
  const items = await readProjectItems(provider, { project, repository, query });
  const issues = new Map();
  const pendingIssues = items.map(itemIssueNumber).filter((number) => number !== null);

  while (pendingIssues.length > 0) {
    const issueNumberValue = pendingIssues.shift();
    if (issues.has(issueNumberValue)) continue;
    const issue = await provider.readIssue({ repository, issueNumber: issueNumberValue });
    if (!issue) throw new Error(`Issue readback was missing #${issueNumberValue}.`);
    issues.set(issueNumberValue, issue);
    const related = [parentIssue(null, issue), ...childIssues(issue)]
      .map(issueNumber)
      .filter((number) => number !== null && !issues.has(number));
    pendingIssues.push(...related);
  }

  const pullRequests = new Map();
  for (const item of items) {
    for (const reference of linkedPullRequests(item)) {
      const key = `${reference.repository ?? repository}#${reference.number}`;
      if (pullRequests.has(key)) continue;
      const pullRequest = await provider.readPullRequest({
        repository: reference.repository ?? repository,
        pullNumber: reference.number,
      });
      if (!pullRequest) throw new Error(`Pull request readback was missing #${reference.number}.`);
      pullRequests.set(key, pullRequestFields(reference, pullRequest));
    }
  }

  const records = items.map((item) => {
    const number = itemIssueNumber(item);
    const issue = issues.get(number) ?? null;
    const parent = parentIssue(item, issue);
    const pulls = linkedPullRequests(item).map((reference) =>
      pullRequests.get(`${reference.repository ?? repository}#${reference.number}`),
    );
    return {
      issueNumber: number,
      parentIssue: parent,
      parentIssueNumber: issueNumber(parent),
      childIssues: childIssues(issue),
      projectStatus: projectStatus(item),
      issue,
      pullRequests: pulls,
      projectItem: item,
    };
  });

  return {
    project,
    repository,
    items,
    records,
    issues: [...issues.values()],
    pullRequests: [...pullRequests.values()],
  };
}

function defaultQueueDecision(records) {
  const statuses = [...new Set(records.map(({ projectStatus }) => projectStatus).filter(Boolean))];
  if (statuses.length !== 1 || !["Todo", "Backlog"].includes(statuses[0])) {
    return { kind: "hold", eligible: false };
  }
  const pulls = records.flatMap(({ pullRequests: linked }) => linked);
  if (pulls.some((pullRequest) => pullRequest?.state === "open" || pullRequest?.mergedAt)) {
    return { kind: "hold", eligible: false };
  }
  return { kind: "eligible", eligible: true, status: statuses[0] };
}

function selectQueueItem(snapshot, classify = defaultQueueDecision) {
  const groups = new Map();
  for (const record of snapshot.records) {
    const root = record.parentIssueNumber ?? record.issueNumber;
    const group = groups.get(root) ?? { rootIssueNumber: root, records: [] };
    group.records.push(record);
    groups.set(root, group);
  }
  const candidates = [...groups.values()]
    .map((group) => ({ ...group, decision: classify(group.records) }))
    .filter(({ decision }) => decision.eligible)
    .sort((left, right) => {
      const rank = { Todo: 0, Backlog: 1 };
      return (rank[left.decision.status] ?? 2) - (rank[right.decision.status] ?? 2);
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

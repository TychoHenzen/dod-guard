// Snapshot fixtures for the closure helper, built from the GitHub state
// recorded on 2026-10-09 at master 29a028ba. Epic #683 has sub-issues
// #775-#778, which delivery roots #818 (PR #819), #820 (PR #835), #840, and
// #841 replace. The live #683 group was since closed by owner decision, so the
// fixture rebuilds it as it stood before those closes: the four sub-issues and
// #683 open. #840 and #841 have not merged; their pull requests #901 and #902
// and those SHAs are synthetic. #831 (PR #836, child #832) and #833 (PR #839)
// are the closed-and-Done deliveries that carry no completion record.
import { RECORD_KINDS, renderCompletionRecord } from "./closure-records.mjs";

const REPOSITORY = "TychoHenzen/dod-guard";
const PROJECT = Object.freeze({
  owner: "TychoHenzen",
  number: 2,
  statusFieldId: "PVTSSF_status",
  doneOptionId: "option-done",
});

const DELIVERIES = Object.freeze({
  818: {
    pull: 819,
    ref: "codex/818-align-scanner-rules-clean-code",
    head: "c10d2a15af8c9158d392d42348d7f0e107d98efa",
    merge: "2e1af2c3cb6270197077320c9252fb5150d0304a",
    replaces: 775,
  },
  820: {
    pull: 835,
    ref: "codex/820-normalize-quality-guard-severity-profile-contracts",
    head: "444bd4e285f69e06a59e04cb12af665dd58f2c70",
    merge: "acf083ab18eb6056ba611584a1bbc1edcf677ec0",
    replaces: 776,
  },
  840: {
    pull: 901,
    ref: "codex/840-quiet-false-positives",
    head: "8400000000000000000000000000000000000840",
    merge: "8400000000000000000000000000000000000901",
    replaces: 777,
  },
  841: {
    pull: 902,
    ref: "codex/841-prove-severity-migration",
    head: "8410000000000000000000000000000000000841",
    merge: "8410000000000000000000000000000000000902",
    replaces: 778,
  },
  831: {
    pull: 836,
    ref: "codex/831-route-goal-sdlc-stages-by-intelligence-vs-effort",
    head: "e783f4269c5627f4ad10efdb97dfc12a9918da83",
    merge: "8f7b04b0c735453e1487ca1fd0b7a308ccb39fee",
  },
  833: {
    pull: 839,
    ref: "codex/833-add-automated-merge-conflict-triage-to-the-delivery",
    head: "1c54e77441ea83b644f0e034f21071372cabd113",
    merge: "29a028ba2b0be18ce89625555576786269821239",
  },
});

function item(number, status, { parent = null, linked = [] } = {}) {
  return {
    id: `PVTI_${number}`,
    content: { number, repository: REPOSITORY },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: REPOSITORY },
      { name: "Parent issue", value: parent === null ? null : { number: parent } },
      { name: "Linked pull requests", value: linked.map((number) => ({ number, repository: REPOSITORY })) },
    ],
  };
}

function issue(number, { state = "open", parent = null, children = [], body = "", comments = [] } = {}) {
  return {
    number,
    state,
    title: `Issue ${number}`,
    parent: parent === null ? null : { number: parent },
    children: children.map((child) => ({ number: child })),
    body,
    comments,
  };
}

function pull(root, { checks = "pass", base = "master" } = {}) {
  const delivery = DELIVERIES[root];
  return {
    number: delivery.pull,
    state: "closed",
    mergedAt: "2026-10-08T17:13:52Z",
    head: { repository: REPOSITORY, ref: delivery.ref, sha: delivery.head },
    base: { ref: base, sha: "base0000000000000000000000000000000000000" },
    mergeCommit: { oid: delivery.merge },
    requiredChecks: [{ name: "build-test", bucket: checks }],
  };
}

function completionComment(root, overrides = {}) {
  const delivery = DELIVERIES[root];
  const fields = {
    pullRequest: delivery.pull,
    mergeCommit: delivery.merge,
    trustedHeadSha: delivery.head,
    requiredChecks: "pass",
    pendingRows: [],
    ...overrides,
  };
  return { id: Number(`${root}01`), body: renderCompletionRecord(fields) };
}

// A handoff comment that quotes record markers mid-text in each form a handoff or
// review uses: inline code, a fenced copy, and the heading and marker on their own
// lines under another heading. It is never a record of either kind.
function quotingComment(id, kinds = ["completion", "closure"]) {
  const body = ["## Implementation handoff", "", "Task T1 changed the closure helper.", ""];
  for (const kind of kinds) {
    const { heading, marker } = RECORD_KINDS[kind];
    body.push(
      `The helper writes \`${marker}\` under \`${heading}\`.`,
      "",
      "```text",
      heading,
      "",
      marker,
      "```",
      "",
      "### Quoted record",
      "",
      heading,
      "",
      marker,
      "",
    );
  }
  return { id, body: body.join("\n") };
}

function supersedesBody(numbers) {
  return [
    "## Outcome",
    "",
    "Delivery root.",
    "",
    "## Implementation notes",
    "",
    "### supersedes",
    "",
    "```json",
    JSON.stringify(numbers),
    "```",
    "",
  ].join("\n");
}

function epicBody({ uncheckedOwn = false } = {}) {
  const criteria = [
    "- [ ] Every retained rule is sourced (#775)",
    "- [ ] One severity vocabulary (#776)",
    "- [ ] Rule boundaries reconciled (#777)",
    "- [ ] Migration proven across reports (#778)",
  ];
  if (uncheckedOwn) criteria.push("- [ ] Publish the migration note");
  return [
    "## Outcome",
    "",
    "Clean Code is the authority.",
    "",
    "## Acceptance criteria",
    "",
    ...criteria,
    "",
  ].join("\n");
}

// options.roots limits which roots carry their supersedes record;
// options.record maps a root to completion-record overrides, or to null for no
// record; options.pull maps a root to pull-request overrides.
function recordedSnapshot(options = {}) {
  const roots = options.roots ?? [818, 820, 840, 841];
  const snapshot = {
    repository: REPOSITORY,
    defaultBranch: "master",
    project: { ...PROJECT },
    items: [item(683, "Backlog")],
    issues: [issue(683, { children: [775, 776, 777, 778], body: epicBody(options) })],
    pullRequests: [],
  };
  for (const root of [818, 820, 840, 841]) {
    const original = DELIVERIES[root].replaces;
    snapshot.items.push(item(original, "Backlog", { parent: 683 }));
    snapshot.issues.push(issue(original, { parent: 683 }));
  }
  for (const root of [818, 820, 840, 841]) {
    const overrides = options.record?.[root];
    const comments = overrides === null ? [] : [completionComment(root, overrides)];
    const body = roots.includes(root) ? supersedesBody([DELIVERIES[root].replaces]) : "## Outcome\n";
    snapshot.items.push(item(root, "Done", { linked: [DELIVERIES[root].pull] }));
    snapshot.issues.push(issue(root, { state: "closed", body, comments }));
    snapshot.pullRequests.push(pull(root, options.pull?.[root]));
  }
  return snapshot;
}

// #831 with child #832, and #833: merged, closed by closing keywords, and set
// Done while live rows were pending, with no completion record on any of them.
// options.record833 gives #833 a completion record with those overrides.
function closedWithoutEvidence(options = {}) {
  const comments833 = options.record833 ? [completionComment(833, options.record833)] : [];
  return {
    repository: REPOSITORY,
    defaultBranch: "master",
    project: { ...PROJECT },
    items: [
      item(831, "Done", { linked: [DELIVERIES[831].pull] }),
      item(832, "Done", { parent: 831 }),
      item(833, "Done", { linked: [DELIVERIES[833].pull] }),
    ],
    issues: [
      issue(831, { state: "closed", children: [832] }),
      issue(832, { state: "closed", parent: 831 }),
      issue(833, { state: "closed", comments: comments833 }),
    ],
    pullRequests: [pull(831), pull(833)],
  };
}

// A chain of open parents above one replaced original: #777 under #2001,
// #2001 under #2002, and so on up to #2000 + depth.
function chainSnapshot(depth) {
  const snapshot = recordedSnapshot({ roots: [840] });
  snapshot.items = snapshot.items.filter(({ content }) => [777, 840].includes(content.number));
  snapshot.issues = snapshot.issues.filter(({ number }) => [777, 840].includes(number));
  snapshot.pullRequests = [pull(840)];
  let child = 777;
  for (let level = 1; level <= depth; level += 1) {
    const parent = 2000 + level;
    snapshot.issues.find(({ number }) => number === child).parent = { number: parent };
    snapshot.items.push(item(parent, "Backlog"));
    snapshot.issues.push(
      issue(parent, { children: [child], body: `## Acceptance criteria\n\n- [ ] Done by #${child}\n` }),
    );
    child = parent;
  }
  return snapshot;
}

function ok(value) {
  return { status: 0, stderr: "", stdout: value === undefined ? "" : JSON.stringify(value) };
}

function argValue(args, prefix) {
  return args.find((value) => String(value).startsWith(prefix))?.slice(prefix.length);
}

function projectReply(state, args, endpoint) {
  const base = `users/${PROJECT.owner}/projectsV2/${PROJECT.number}`;
  if (endpoint === base) return ok({ node_id: "PVT_fixture" });
  if (endpoint.startsWith(`${base}/fields`)) {
    const options = [
      { id: PROJECT.doneOptionId, name: { raw: "Done" } },
      { id: "option-backlog", name: { raw: "Backlog" } },
    ];
    return ok([[{ id: 1, node_id: PROJECT.statusFieldId, name: "Status", data_type: "single_select", options }]]);
  }
  if (endpoint.startsWith(`${base}/items?`)) {
    const items = [...state.statuses].map(([number, status]) => ({
      id: number,
      node_id: `PVTI_${number}`,
      content: { number, repository: { full_name: REPOSITORY } },
      fields: [{ id: 1, name: "Status", value: { name: { raw: status } } }],
    }));
    return ok([items]);
  }
  const number = Number(endpoint.slice(`${base}/items/`.length));
  state.statuses.set(number, argValue(args, "fields[][value]=") === PROJECT.doneOptionId ? "Done" : "Backlog");
  return ok();
}

function issueReply(state, args, endpoint) {
  const [, number, comments] = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)(\/comments)?/.exec(endpoint);
  const target = state.issues.get(Number(number));
  const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
  if (comments && method === "POST") {
    target.comments.push({ id: state.nextComment++, body: argValue(args, "body=") });
    return ok({});
  }
  if (comments) return ok([target.comments]);
  if (method === "PATCH") {
    if (!state.ignoreClose) {
      target.state = argValue(args, "state=");
      target.state_reason = argValue(args, "state_reason=");
    }
    return ok({});
  }
  return ok({ number: target.number, state: target.state, state_reason: target.state_reason ?? null });
}

function commentEdit(state, args, endpoint) {
  const id = Number(endpoint.split("/").pop());
  for (const target of state.issues.values()) {
    const comment = target.comments.find((candidate) => candidate.id === id);
    if (comment) comment.body = argValue(args, "body=");
  }
  return ok({});
}

function pullReply(state, endpoint) {
  const live = state.pulls.get(Number(endpoint.split("/").pop()));
  return ok({
    number: live.number,
    merged_at: live.mergedAt,
    merge_commit_sha: live.mergeCommit.oid,
    head: { sha: live.head.sha },
    base: { ref: live.base.ref },
  });
}

// Edits and reads fields by name, so a renamed field fails the test loudly instead of
// reading or writing whichever field happens to sit at the old index.
function fieldOf(entry, name) {
  const field = entry.fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`no "${name}" field on project item #${entry.content.number}`);
  return field;
}

function statusName(entry) {
  return fieldOf(entry, "Status").value.name;
}

// An in-memory GitHub that answers the REST calls closure apply and record
// make, records every call in order, and can fail the first call a predicate
// matches or accept a close without performing it.
function fakeGitHub(snapshot, { failOnce = null, ignoreClose = false } = {}) {
  const state = {
    issues: new Map(snapshot.issues.map((entry) => [entry.number, structuredClone(entry)])),
    pulls: new Map(snapshot.pullRequests.map((entry) => [entry.number, entry])),
    statuses: new Map(snapshot.items.map((entry) => [entry.content.number, statusName(entry)])),
    nextComment: 9000,
    ignoreClose,
  };
  const calls = [];
  let failure = failOnce;
  const runner = (args) => {
    calls.push(args);
    if (failure?.(args)) {
      failure = null;
      return { status: 1, stderr: "simulated failure", stdout: "" };
    }
    const endpoint = args.find((value) => /^(repos|users)\//.test(String(value)));
    if (endpoint.startsWith("users/")) return projectReply(state, args, endpoint);
    if (endpoint.includes("/issues/comments/")) return commentEdit(state, args, endpoint);
    if (endpoint.includes("/pulls/")) return pullReply(state, endpoint);
    return issueReply(state, args, endpoint);
  };
  return { runner, calls, state };
}

function mutating(args) {
  return args.includes("--method") && args[args.indexOf("--method") + 1] !== "GET";
}

function mergeResult(linked) {
  return {
    pullNumber: DELIVERIES[840].pull,
    trustedHead: DELIVERIES[840].head,
    mergeCommitSha: DELIVERIES[840].merge,
    linkedIssues: linked.map((number) => ({ number, state: "CLOSED" })),
  };
}

// Returns the mutating gh calls aimed at one issue comment, so a test can show which comment was edited.
function patchesTo(github, commentId) {
  return github.calls.filter(
    (args) => mutating(args) && args.some((value) => String(value).endsWith(`/issues/comments/${commentId}`)),
  );
}

function holdOf(plan, number) {
  return plan.holds.find((hold) => hold.issue === number);
}

// Edits a project field by name on the item for one issue. A missing item or field
// throws with both named, so a renamed field stops the test instead of editing a neighbour.
function setField(snapshot, number, name, value) {
  const entry = snapshot.items.find(({ content }) => content.number === number);
  if (!entry) throw new Error(`no project item for #${number}, so no "${name}" field to set`);
  fieldOf(entry, name).value = value;
}

// A later run starts from what GitHub now holds, so a rerun on this snapshot checks that
// the writes verify on their own.
function snapshotAfter(snapshot, github) {
  const after = structuredClone(snapshot);
  for (const entry of after.issues) {
    const live = github.state.issues.get(entry.number);
    Object.assign(entry, { state: live.state, state_reason: live.state_reason, comments: live.comments });
  }
  for (const entry of after.items) {
    setField(after, entry.content.number, "Status", { name: github.state.statuses.get(entry.content.number) });
  }
  return after;
}

export {
  DELIVERIES,
  REPOSITORY,
  chainSnapshot,
  closedWithoutEvidence,
  completionComment,
  fakeGitHub,
  holdOf,
  issue,
  item,
  mergeResult,
  mutating,
  patchesTo,
  pull,
  quotingComment,
  recordedSnapshot,
  setField,
  snapshotAfter,
  supersedesBody,
};

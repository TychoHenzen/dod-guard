// Project item pages and the one-value departures shared by the closure
// snapshot test files. The routes that serve these pages are in
// closure-snapshot-routes.mjs.
import {
  FOREIGN,
  issueContent,
  projectItem,
  pull,
  REPO_URL,
} from "./rest-shapes.mjs";
import { linkedProjectNode } from "../closure-snapshot.test-support.mjs";

const HEAD = { 21: "a1".repeat(20), 22: "a2".repeat(20), 23: "a3".repeat(20) };
const MERGE = { 21: "b1".repeat(20), 22: "b2".repeat(20), 23: "b3".repeat(20) };
// A repository name the shared pattern rejects, planted by the departures in
// fixtureRoutes.
const DEEP_SEEK = "TychoHenzen/Deep+Seek";
const EPIC_BODY =
  "## Acceptance criteria\n\n" +
  "- [ ] Sub-issue #11 delivers the rule\n" +
  "- [ ] Sub-issue #12 documents it\n";
const COMMENT_BODY = "Handoff note that quotes no completion record.";
const CHECKS = [
  { bucket: "pass", name: "build-test", state: "SUCCESS" },
  { bucket: "pass", name: "lint", state: "SUCCESS" },
];

// Two --slurp pages in Project order. PVTI_f11 is a foreign issue whose number
// matches target issue #11. PVTI_t12 also links a foreign pull request: the
// item keeps that link, but the snapshot never lists it as a pull request
// record of the target repository.
function firstValuePage() {
  return [
    projectItem({
      nodeId: "PVTI_t10",
      databaseId: 1010,
      content: issueContent(10, {
        body: EPIC_BODY,
        subIssues: 2,
        comments: 1,
      }),
    }),
    projectItem({
      nodeId: "PVTI_f11",
      databaseId: 1011,
      content: issueContent(11, { repo: FOREIGN }),
    }),
  ];
}

function closedSubIssueItem() {
  return projectItem({
    nodeId: "PVTI_t11",
    databaseId: 1111,
    content: issueContent(11, {
      state: "closed",
      stateReason: "completed",
      parent: 10,
    }),
    status: "Done",
    parent: 10,
    linked: [pull(21, { sha: HEAD[21], mergeCommit: MERGE[21] })],
  });
}

function openSubIssueItem() {
  return projectItem({
    nodeId: "PVTI_t12",
    databaseId: 1112,
    content: issueContent(12, { parent: 10 }),
    status: "Todo",
    parent: 10,
    linked: [
      pull(23, { sha: HEAD[23], mergeCommit: MERGE[23] }),
      // An open pull request carries the test-merge commit GitHub reports
      // for it, with merged_at still null.
      {
        ...pull(22, { sha: HEAD[22], state: "open", merged: false }),
        merge_commit_sha: MERGE[22],
      },
      pull(77, {
        repo: FOREIGN,
        sha: "d7".repeat(20),
        state: "open",
        merged: false,
      }),
    ],
  });
}

function valuePages() {
  return [firstValuePage(), [closedSubIssueItem(), openSubIssueItem()]];
}

// The repository's explicit links. Project 3 is closed, so it is dropped before
// counting and never read.
const LINKED = [linkedProjectNode(2), linkedProjectNode(3, { closed: true })];

function setStatus(pages, nodeId, value) {
  const entry = pages.flat().find((item) => item.node_id === nodeId);
  entry.fields.find((field) => field.name === "Status").value = value;
}

function withoutKey(pages, nodeId, key) {
  const entry = pages.flat().find((item) => item.node_id === nodeId);
  delete entry.content[key];
}

// One Project field of one item in the values pages, so a departure can change
// that value in place.
function fieldOf(pages, nodeId, name) {
  const entry = pages.flat().find((item) => item.node_id === nodeId);
  return entry.fields.find((field) => field.name === name);
}

// Each departure plants a name the shared pattern rejects where the builder
// reads one from GitHub data. A departure that plants it beside a valid name a
// fallback could read keeps that valid name, so only the rejection itself can
// fail the build.
const DEPARTURES = {
  "item-name": (pages) => {
    const entry = pages.flat().find((item) => item.node_id === "PVTI_f11");
    entry.content.repository.full_name = DEEP_SEEK;
  },
  "repository-field": (pages) => {
    fieldOf(pages, "PVTI_t11", "Repository").value = { full_name: DEEP_SEEK };
  },
  "parent-url": (pages) => {
    fieldOf(pages, "PVTI_t12", "Parent issue").value = {
      repository_url: REPO_URL,
      url: `https://api.github.com/repos/${DEEP_SEEK}/issues/10`,
      number: 10,
    };
  },
  "linked-pull-url": (pages) => {
    const rejected = pull(78, {
      repo: DEEP_SEEK,
      sha: "d8".repeat(20),
      state: "open",
      merged: false,
    });
    rejected.base.repo.full_name = FOREIGN;
    fieldOf(pages, "PVTI_t12", "Linked pull requests").value.push(rejected);
  },
  "linked-pull-base": (pages) => {
    const rejected = pull(79, {
      repo: FOREIGN,
      sha: "d9".repeat(20),
      state: "open",
      merged: false,
    });
    // ok() drops an undefined url when it serializes the page, so the builder
    // reads the url as absent.
    rejected.url = undefined;
    rejected.base.repo.full_name = DEEP_SEEK;
    fieldOf(pages, "PVTI_t12", "Linked pull requests").value.push(rejected);
  },
  "head-repository": (pages) => {
    const linked = fieldOf(pages, "PVTI_t12", "Linked pull requests");
    linked.value[0].head.repo.full_name = DEEP_SEEK;
  },
};
const REJECTED_NAMES = Object.keys(DEPARTURES);

const ARCHIVED_AT = "2026-10-01T09:30:00Z";
const ARCHIVED_ISSUE_NUMBER = 13;
const ARCHIVED_ITEM_ID = 1113;
const ARCHIVED_PULL_NUMBER = 24;
const ARCHIVED_HEAD = "e4".repeat(20);
const ARCHIVED_MERGE = "f4".repeat(20);

// PVTI_t13 is archived and is the only item that references issue #13 and pull
// request #24. No route answers #24's check reads, so any read made for it
// fails the build. PVTI_t11 carries an explicit null archived_at, and every
// other item has no archived_at key at all.
function archiveItems(pages) {
  pages.flat().find((item) => item.node_id === "PVTI_t11").archived_at = null;
  const archived = projectItem({
    nodeId: "PVTI_t13",
    databaseId: ARCHIVED_ITEM_ID,
    content: issueContent(ARCHIVED_ISSUE_NUMBER),
    status: "Done",
    linked: [
      pull(ARCHIVED_PULL_NUMBER, {
        sha: ARCHIVED_HEAD,
        mergeCommit: ARCHIVED_MERGE,
      }),
    ],
  });
  pages.at(-1).push({ ...archived, archived_at: ARCHIVED_AT });
}

// Project 2 item 273009693 as the live REST read returns it: content_type
// PullRequest and a content with no repository or repository_url key. Its
// Repository field still names the repository.
function addPullRequestItem(pages) {
  const item = projectItem({
    nodeId: "PVTI_pr",
    databaseId: 1114,
    content: issueContent(946),
    status: "Done",
  });
  item.content_type = "PullRequest";
  item.content = { number: 946, title: "Pull request 946", state: "closed" };
  pages.at(-1).push(item);
}

// Issue #12 reports one blocker, so the builder must read its blocked_by list.
function blockedOnTwelve(pages) {
  const entry = pages.flat().find((item) => item.node_id === "PVTI_t12");
  entry.content.issue_dependencies_summary = {
    blocked_by: 1,
    total_blocked_by: 1,
    blocking: 0,
    total_blocking: 0,
  };
}

// Variants that change the item pages themselves, before any route serializes
// them.
const PAGE_VARIANTS = {
  ...DEPARTURES,
  blocked: blockedOnTwelve,
  "blocked-failure": blockedOnTwelve,
  "contradictory-status": (pages) => {
    setStatus(pages, "PVTI_t11", {
      id: "opt-done",
      name: { raw: "Done", html: "Todo" },
    });
  },
  "blank-status": (pages) => {
    setStatus(pages, "PVTI_t11", {
      id: "opt-done",
      name: { raw: "", html: "" },
    });
  },
  "absent-parent-url": (pages) => {
    withoutKey(pages, "PVTI_t10", "parent_issue_url");
  },
  "missing-body": (pages) => {
    withoutKey(pages, "PVTI_t11", "body");
  },
  archived: archiveItems,
  "pull-request-item": addPullRequestItem,
};

export {
  ARCHIVED_ISSUE_NUMBER,
  ARCHIVED_PULL_NUMBER,
  CHECKS,
  COMMENT_BODY,
  EPIC_BODY,
  HEAD,
  LINKED,
  MERGE,
  PAGE_VARIANTS,
  REJECTED_NAMES,
  valuePages,
};

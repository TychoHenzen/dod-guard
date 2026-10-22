// The round-trip fixtures: what GitHub would answer for each linked Project
// and target repository, built from the shared REST shapes.
import {
  completionComment,
  DELIVERIES,
  FOREIGN_REPOSITORY,
  REPOSITORY,
  supersedesBody,
} from "../lib/closure.test-support.mjs";
import {
  ENDPOINT,
  linkedProjectNode,
  linkedProjectsReply,
} from "../lib/closure-snapshot.test-support.mjs";
import {
  checkRunsReply,
  commitStatusReply,
  fieldPages,
  issueContent,
  ok,
  projectItem,
  pull,
} from "../lib/fixtures/rest-shapes.mjs";

const ROOT = 840;
const ORIGINAL = DELIVERIES[ROOT].replaces;
const BEEHAIVE = "TychoHenzen/BeeHAIve";

// The base routes of a linked-Project fixture: the repository, its one open
// explicit link, and the fields and values reads of that Project over the
// given item pages.
function projectRoutes(pages) {
  return {
    [ENDPOINT.repository]: ok({
      full_name: REPOSITORY,
      default_branch: "master",
    }),
    [ENDPOINT.linkedProjects]: linkedProjectsReply([linkedProjectNode(2)]),
    [ENDPOINT.fields(2)]: ok(fieldPages()),
    [ENDPOINT.values(2)]: ok(pages),
  };
}

function checkRoutes(delivery) {
  return {
    [ENDPOINT.checkRuns(delivery.head)]: checkRunsReply(delivery.head),
    [ENDPOINT.statuses(delivery.head)]: commitStatusReply(delivery.head),
  };
}

function deliveredPages(rootPull) {
  const rootIssue = issueContent(ROOT, {
    state: "closed",
    stateReason: "completed",
    body: supersedesBody([ORIGINAL]),
    comments: 1,
  });
  return [
    [
      projectItem({
        nodeId: `PVTI_${ORIGINAL}`,
        databaseId: 7771,
        content: issueContent(ORIGINAL),
        status: "Backlog",
      }),
      projectItem({
        nodeId: `PVTI_${ROOT}`,
        databaseId: 8401,
        content: rootIssue,
        status: "Done",
        linked: [rootPull],
      }),
    ],
  ];
}

function roundTripPages(verifiedPull, pendingPull) {
  const closed = { state: "closed", stateReason: "completed", comments: 1 };
  return [
    [
      projectItem({
        nodeId: "PVTI_840",
        databaseId: 8401,
        content: issueContent(840, closed),
        status: "Done",
        linked: [verifiedPull],
      }),
      projectItem({
        nodeId: "PVTI_841",
        databaseId: 8411,
        content: issueContent(841, closed),
        status: "Done",
        linked: [pendingPull],
      }),
      projectItem({
        nodeId: "PVTI_950",
        databaseId: 9501,
        content: issueContent(950),
        status: "Todo",
      }),
    ],
  ];
}

// A verified delivery: merged root #840 (PR #901) supersedes open original
// #777, and its completion record matches the live pull request. Plan has
// exactly one close to make.
function deliveredFixture() {
  const root = DELIVERIES[ROOT];
  const rootPull = pull(root.pull, { sha: root.head, mergeCommit: root.merge });
  const rootComment = completionComment(ROOT);
  const pages = deliveredPages(rootPull);
  return {
    pages,
    pulls: [rootPull],
    issues: [
      { number: ORIGINAL, state: "open", state_reason: null, comments: [] },
      {
        number: ROOT,
        state: "closed",
        state_reason: "completed",
        comments: [rootComment],
      },
    ],
    routes: {
      ...projectRoutes(pages),
      [ENDPOINT.comments(ROOT)]: ok([[rootComment]]),
      [ENDPOINT.protection]: ok({ contexts: ["build-test"] }),
      ...checkRoutes(root),
    },
  };
}

// Three parents of the target repository for the round trip: #840 is a
// verified delivery, #841 is merged with one acceptance row still pending, and
// #950 is an open Todo parent with no pull request.
function roundTripFixture() {
  const verified = DELIVERIES[ROOT];
  const pending = DELIVERIES[841];
  const verifiedPull = pull(verified.pull, {
    sha: verified.head,
    mergeCommit: verified.merge,
  });
  const pendingPull = pull(pending.pull, {
    sha: pending.head,
    mergeCommit: pending.merge,
  });
  const pages = roundTripPages(verifiedPull, pendingPull);
  return {
    routes: {
      ...projectRoutes(pages),
      [ENDPOINT.comments(840)]: ok([[completionComment(840)]]),
      [ENDPOINT.comments(841)]: ok([
        [completionComment(841, { pendingRows: ["AC-1"] })],
      ]),
      [ENDPOINT.protection]: ok({ contexts: ["build-test"] }),
      ...checkRoutes(verified),
      ...checkRoutes(pending),
    },
  };
}

// A cross-repository delivery group: #20 has sub-issue DeepSeekCustom#21 and
// #32 has parent BeeHAIve#31, while target issues #21 and #31 exist under the
// same numbers. A classifier that grouped by bare number would join them, and
// this test proves it does not.
function crossRepositoryFixture() {
  const pages = [
    [
      projectItem({
        nodeId: "PVTI_20",
        databaseId: 2020,
        content: issueContent(20, { subIssues: 1 }),
        status: "Backlog",
      }),
      projectItem({
        nodeId: "PVTI_21",
        databaseId: 2021,
        content: issueContent(21),
        status: "Todo",
      }),
      projectItem({
        nodeId: "PVTI_31",
        databaseId: 3131,
        content: issueContent(31),
        status: "Backlog",
      }),
      projectItem({
        nodeId: "PVTI_32",
        databaseId: 3232,
        content: issueContent(32, { parent: 31, parentRepo: BEEHAIVE }),
        status: "Backlog",
        parent: 31,
        parentRepo: BEEHAIVE,
      }),
    ],
  ];
  const foreignSubIssue = {
    number: 21,
    repository_url: `https://api.github.com/repos/${FOREIGN_REPOSITORY}`,
  };
  return {
    routes: {
      ...projectRoutes(pages),
      [ENDPOINT.subIssues(20)]: ok([[foreignSubIssue]]),
    },
  };
}

export {
  BEEHAIVE,
  crossRepositoryFixture,
  deliveredFixture,
  ORIGINAL,
  roundTripFixture,
  ROOT,
};

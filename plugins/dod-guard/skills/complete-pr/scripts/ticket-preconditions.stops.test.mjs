// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import { it } from "node:test";
import {
  ENDPOINT,
  issueProjectItemNode,
  issueProjectItemsReply,
  linkedProjectNode,
  linkedProjectsReply,
  NOT_FOUND,
} from "./lib/closure-snapshot.test-support.mjs";
import {
  assertStop,
  ISSUE,
  PROJECT_NUMBER,
  pullRequestReply,
  SECOND_PROJECT,
} from "./lib/ticket-preconditions.test-support.mjs";

it("exits 1 with linked-project-none when the repository has no open linked Project", () => {
  assertStop({ [ENDPOINT.linkedProjects]: linkedProjectsReply([]) }, "linked-project-none");
});

it("exits 1 with linked-project-several when the repository links two open Projects", () => {
  const nodes = [linkedProjectNode(PROJECT_NUMBER), linkedProjectNode(SECOND_PROJECT)];
  assertStop({ [ENDPOINT.linkedProjects]: linkedProjectsReply(nodes) }, "linked-project-several");
});

it("exits 1 with issue-not-in-repository when the issue does not exist", () => {
  assertStop({ [ISSUE]: NOT_FOUND }, "issue-not-in-repository");
});

it("exits 1 with issue-not-in-repository when the number is a pull request", () => {
  assertStop({ [ISSUE]: pullRequestReply() }, "issue-not-in-repository");
});

it("exits 1 with issue-not-in-project when the Project holds no item for the issue", () => {
  const reply = issueProjectItemsReply([issueProjectItemNode(SECOND_PROJECT, "Todo")]);
  assertStop({ [ENDPOINT.issueProjectItems]: reply }, "issue-not-in-project");
});

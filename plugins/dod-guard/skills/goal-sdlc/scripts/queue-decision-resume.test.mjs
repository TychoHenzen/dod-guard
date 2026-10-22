import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { TODAY } from "./harness/queue-decision-checks.mjs";
import { issue, item, pullRequest, snapshot } from "./queue-decision.test-support.mjs";

test("queue selection resumes In Progress work before starting Todo", () => {
  const input = snapshot({
    items: [item(517, "Todo"), item(801, "In Progress"), item(800, "In Progress", { linked: [900] })],
    issues: [
      issue(517, { state: "open" }),
      issue(801, { state: "open", activeCheckpoint: true }),
      issue(800, { state: "open" }),
    ],
    pullRequests: [pullRequest(900, { state: "OPEN", mergedAt: null })],
  });
  assert.equal(classifyQueue(input, { today: TODAY }).selected.rootIssueNumber, 800);
});

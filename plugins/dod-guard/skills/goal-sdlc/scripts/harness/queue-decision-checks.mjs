// Lookups and assertions over a queue-decision snapshot, shared by the queue-decision tests.
import assert from "node:assert/strict";
import { classifyQueue } from "../../../../lib/queue-classifier.mjs";

export const TODAY = "2026-10-10";

export function decisionOf(input, root) {
  const group = classifyQueue(input, { today: TODAY }).groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
  return group.decision;
}

export function assertHold(input, root, ...reasons) {
  const decision = decisionOf(input, root);
  assert.equal(decision.kind, "hold", JSON.stringify(decision));
  for (const reason of reasons) {
    assert.ok(decision.reasons.includes(reason), `missing "${reason}" in ${decision.reasons.join("; ")}`);
  }
}

export function findIssue(input, number) {
  return input.issues.find((entry) => entry.number === number);
}

function findItem(input, number) {
  return input.items.find(({ content }) => content.number === number);
}

export function setStatus(input, number, name) {
  findItem(input, number).fields.find((field) => field.name === "Status").value = { name };
}

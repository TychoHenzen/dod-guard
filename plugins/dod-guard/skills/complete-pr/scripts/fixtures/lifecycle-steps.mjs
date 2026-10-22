import assert from "node:assert/strict";
import { runBoundary, runRest } from "./lifecycle-boundary.mjs";
import { ISSUE_NUMBERS, REPOSITORY } from "./lifecycle-constants.mjs";

export async function assertIssueReadbacks(
  context,
  { labels, state = "open", phase = "issue" },
) {
  for (const number of ISSUE_NUMBERS) {
    const issue = await runBoundary(context, {
      operation: `${phase}-read-${number}`,
      request: { repository: REPOSITORY, issueNumber: number },
      restEndpoint: `GET /repos/${REPOSITORY}/issues/${number}`,
      rest: () =>
        runRest(context.transport, [
          "api",
          `repos/${REPOSITORY}/issues/${number}`,
        ]),
    });
    assert.equal(issue.repository.full_name, REPOSITORY);
    assert.deepEqual(
      issue.labels.map(({ name }) => name),
      labels.get(number),
    );
    assert.equal(issue.state, state);
  }
}

function linkChildIfMissing(context, parentNumber, child) {
  const endpoint = `repos/${REPOSITORY}/issues/${parentNumber}/sub_issues`;
  const hasChild = (list) => list.some(({ number }) => number === child.number);
  if (!hasChild(runRest(context.transport, ["api", endpoint]))) {
    runRest(context.transport, [
      "api",
      "--method",
      "POST",
      endpoint,
      "-F",
      `sub_issue_id=${child.id}`,
    ]);
  }
  const readback = runRest(context.transport, ["api", endpoint]);
  if (!hasChild(readback)) {
    throw new Error(`Hierarchy link for issue ${child.number} was unresolved.`);
  }
  return readback;
}

export async function linkHierarchy(context, parentNumber, child) {
  await runBoundary(context, {
    operation: `hierarchy-link-${child.number}`,
    request: {
      repository: REPOSITORY,
      parentNumber,
      childNumber: child.number,
      childId: child.id,
    },
    restEndpoint: `POST /repos/${REPOSITORY}/issues/${parentNumber}/sub_issues`,
    rest: () => linkChildIfMissing(context, parentNumber, child),
  });
}

export async function writeIssueLabels(context, number, labels) {
  await runBoundary(context, {
    operation: `refinement-labels-${number}`,
    request: { repository: REPOSITORY, issueNumber: number, labels },
    restEndpoint: `PATCH /repos/${REPOSITORY}/issues/${number}`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${number}`;
      const existing = runRest(context.transport, ["api", endpoint]);
      const current = existing.labels.map(({ name }) => name);
      if (JSON.stringify(current) !== JSON.stringify(labels)) {
        runRest(context.transport, [
          "api",
          "--method",
          "PATCH",
          endpoint,
          ...labels.flatMap((label) => ["-f", `labels[]=${label}`]),
        ]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      assert.deepEqual(
        readback.labels.map(({ name }) => name),
        labels,
      );
      return readback;
    },
  });
}

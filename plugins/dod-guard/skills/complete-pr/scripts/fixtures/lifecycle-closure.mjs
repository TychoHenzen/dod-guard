import { runBoundary, runRest } from "./lifecycle-boundary.mjs";
import { HEAD_SHA, PULL_NUMBER, REPOSITORY } from "./lifecycle-constants.mjs";

export async function closeIssue(context, number) {
  await runBoundary(context, {
    operation: `closure-${number}`,
    request: { repository: REPOSITORY, issueNumber: number, state: "closed" },
    restEndpoint: `PATCH /repos/${REPOSITORY}/issues/${number}`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${number}`;
      const existing = runRest(context.transport, ["api", endpoint]);
      if (existing.state !== "closed") {
        runRest(context.transport, [
          "api",
          "--method",
          "PATCH",
          endpoint,
          "-f",
          "state=closed",
        ]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      if (readback.state !== "closed") {
        throw new Error(`Issue ${number} closure was unresolved.`);
      }
      return readback;
    },
  });
}

function mergeIfOpen(context) {
  const existing = context.client.getPullRequest();
  if (existing.state === "MERGED") {
    return { merged: true, sha: existing.mergeCommitSha };
  }
  const result = context.client.mergePullRequest(PULL_NUMBER, HEAD_SHA);
  const readback = context.client.getPullRequest();
  if (readback.state !== "MERGED") {
    throw new Error(`Pull request ${PULL_NUMBER} merge was unresolved.`);
  }
  return result;
}

export async function mergePullRequest(context) {
  return runBoundary(context, {
    operation: "completion-merge",
    request: {
      repository: REPOSITORY,
      pullNumber: PULL_NUMBER,
      headSha: HEAD_SHA,
    },
    restEndpoint: `PUT /repos/${REPOSITORY}/pulls/${PULL_NUMBER}/merge`,
    rest: () => mergeIfOpen(context),
  });
}

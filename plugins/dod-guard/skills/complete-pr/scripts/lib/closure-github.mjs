// GitHub REST access for the closure writers. Every helper after `gh` takes
// `api`, an object holding `runner` and `repository`.
function failureText(result, args) {
  return result.stderr?.trim() || result.stdout?.trim() || `gh ${args.slice(0, 4).join(" ")} failed`;
}

function gh(runner, args) {
  const result = runner(args);
  if (result?.status !== undefined && result.status !== 0) throw new Error(failureText(result, args));
  return result?.stdout ? JSON.parse(result.stdout) : null;
}

function readIssue({ runner, repository }, number) {
  return gh(runner, ["api", `repos/${repository}/issues/${number}`]);
}

function readComments({ runner, repository }, number) {
  const pages = gh(runner, [
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/issues/${number}/comments?per_page=100`,
  ]);
  return (pages ?? []).flat();
}

function postComment({ runner, repository }, number, body) {
  gh(runner, ["api", "--method", "POST", `repos/${repository}/issues/${number}/comments`, "-f", `body=${body}`]);
}

function editComment({ runner, repository }, commentId, body) {
  gh(runner, ["api", "--method", "PATCH", `repos/${repository}/issues/comments/${commentId}`, "-f", `body=${body}`]);
}

function closeIssue({ runner, repository }, number, stateReason) {
  const target = `repos/${repository}/issues/${number}`;
  gh(runner, ["api", "--method", "PATCH", target, "-f", "state=closed", "-f", `state_reason=${stateReason}`]);
}

export { closeIssue, editComment, gh, postComment, readComments, readIssue };

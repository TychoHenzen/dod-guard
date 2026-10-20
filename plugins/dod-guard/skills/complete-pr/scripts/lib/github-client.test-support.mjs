// Fixtures shared by the GitHub resource tests.
export const headShaField = "head_sha";

export function okResponse(stdout) {
  return { stderr: "", status: 0, stdout };
}

export function workflowRun(headSha, overrides = {}) {
  return {
    conclusion: "success",
    event: "push",
    [headShaField]: headSha,
    name: "CI",
    path: ".github/workflows/ci.yml@refs/heads/codex/24-complete-pr",
    status: "completed",
    ...overrides,
  };
}

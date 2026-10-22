// Fixtures shared by the GitHub resource tests.
export const headShaField = "head_sha";

export function okResponse(stdout) {
  return { stderr: "", status: 0, stdout };
}

export function workflowRun(headSha, overrides = {}) {
  return {
    conclusion: "success",
    // biome-ignore lint/style/useNamingConvention: object keys mirror the GitHub REST field names.
    created_at: "2026-01-01T00:00:00Z",
    event: "push",
    id: 1,
    [headShaField]: headSha,
    name: "CI",
    path: ".github/workflows/ci.yml@refs/heads/codex/24-complete-pr",
    status: "completed",
    ...overrides,
  };
}

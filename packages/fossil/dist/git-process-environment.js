/** Git global options required for every noninteractive fossil subprocess. */
export const SAFE_GIT_BASE_ARGUMENTS = [
    "--no-pager",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "diff.external=",
];
/** Keeps caller values while overriding Git's interactive controls. */
export function safeGitEnvironment(environment = process.env) {
    return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}
//# sourceMappingURL=git-process-environment.js.map
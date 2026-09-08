/** Git global options required for every noninteractive fossil subprocess. */
export declare const SAFE_GIT_BASE_ARGUMENTS: readonly ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="];
/** Keeps caller values while overriding Git's interactive controls. */
export declare function safeGitEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;

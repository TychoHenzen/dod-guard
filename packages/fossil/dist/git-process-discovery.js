import { spawn } from "node:child_process";
import { SAFE_GIT_BASE_ARGUMENTS, safeGitEnvironment, } from "./git-process-environment.js";
function spawnGit(command, arguments_, options) {
    return spawn(command, [...arguments_], options);
}
export function discoverGitRepository(repositoryPath, runGit = spawnGit, environment = process.env) {
    return runGit("git", [
        ...SAFE_GIT_BASE_ARGUMENTS,
        "-C",
        repositoryPath,
        "rev-parse",
        "--show-toplevel",
    ], {
        shell: false,
        windowsHide: true,
        env: safeGitEnvironment(environment),
    });
}
//# sourceMappingURL=git-process-discovery.js.map
import { spawn } from "node:child_process";
import { collectBoundedGitOutput } from "./git-output-collector.js";
import { SAFE_GIT_BASE_ARGUMENTS, safeGitEnvironment, } from "./git-process-environment.js";
export async function runGitCommand({ arguments_, repositoryPath, input, historyMode = false, }) {
    const scopedArguments = repositoryPath === undefined
        ? arguments_
        : ["-C", repositoryPath, ...arguments_];
    const child = spawn("git", [...SAFE_GIT_BASE_ARGUMENTS, ...scopedArguments], {
        shell: false,
        windowsHide: true,
        env: safeGitEnvironment(),
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (input !== undefined)
        child.stdin?.end(input);
    return collectBoundedGitOutput(child, { historyMode });
}
//# sourceMappingURL=git-process-command.js.map
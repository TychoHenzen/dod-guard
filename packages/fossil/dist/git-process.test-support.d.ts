import type { GitPipedChild } from "./git-process.js";
export declare function pipedChild(): {
    child: GitPipedChild;
    emitStdout: (text: string) => boolean;
    emitStderr: (text: string) => boolean;
    emitError: (error: Error) => boolean;
    close: (code: number | null) => boolean;
    readonly killCalls: number;
};
export declare function repositoryDiscoveryArguments(repositoryPath: string): readonly string[];
export declare function assertResourceLimit(result: Promise<unknown>, message: string): Promise<void>;

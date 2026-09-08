import { StringDecoder } from "node:string_decoder";
import { GitHistoryStatusCounter, } from "./git-process-types/git-history-status-counter.js";
export function createCollectorState(child, historyMode, limits) {
    return {
        child,
        historyMode,
        limits,
        stdoutDecoder: new StringDecoder(),
        stderrDecoder: new StringDecoder(),
        statusCounter: new GitHistoryStatusCounter(),
        stdoutParts: [],
        stderrParts: [],
        stdoutBytes: 0,
        stderrBytes: 0,
        settled: false,
    };
}
//# sourceMappingURL=git-output-collector-state.js.map
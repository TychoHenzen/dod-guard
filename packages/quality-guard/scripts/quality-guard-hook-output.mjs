import {
  emitProtocol,
  reportContext,
  unavailable,
} from "./quality-guard-gate-support.mjs";

export function createHookOutput() {
  const contexts = [];
  const report = (header, lines, tail) => {
    contexts.push(reportContext(header, lines, tail));
    return 0;
  };
  return {
    report,
    unavailable: (filePath, detail) => unavailable(filePath, detail, report),
    flush: () => emitProtocol(contexts),
  };
}

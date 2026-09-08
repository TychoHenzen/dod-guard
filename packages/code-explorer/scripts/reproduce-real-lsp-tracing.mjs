import {
  spawnNativeLspProcess,
} from "../dist/semantic/adapters/native-lsp-process.js";

function summarizeMessage(message, temporaryRoot) {
  return {
    id: message.id,
    method: message.method,
    hasResult: Object.hasOwn(message, "result"),
    hasError: Object.hasOwn(message, "error"),
    error: message.error
      ? {
          code: message.error.code,
          message: String(message.error.message).replaceAll(
            temporaryRoot,
            "<fixture>",
          ),
        }
      : undefined,
    resultShape: Array.isArray(message.result)
      ? `array:${message.result.length}`
      : message.result === null
        ? "null"
        : typeof message.result,
  };
}

function traceChunk(chunk, temporaryRoot) {
  const text = new TextDecoder().decode(chunk);
  for (const body of text
    .split(/Content-Length: \d+\r\n\r\n/)
    .filter(Boolean)) {
    try {
      console.error(
        JSON.stringify(summarizeMessage(JSON.parse(body), temporaryRoot)),
      );
    } catch {
      console.error(JSON.stringify({ undecodedBytes: chunk.byteLength }));
    }
  }
}

function tracedProcess(process_, temporaryRoot, spawnedProcesses) {
  return {
    ...process_,
    onStdout(listener) {
      process_.onStdout((chunk) => {
        traceChunk(chunk, temporaryRoot);
        listener(chunk);
      });
    },
    onExit(listener) {
      process_.onExit(() => {
        spawnedProcesses.delete(process_);
        listener();
      });
    },
  };
}

export function createTracingSpawn(temporaryRoot, spawnedProcesses) {
  return function tracingSpawn(executable, arguments_, environment) {
    const process_ = spawnNativeLspProcess(executable, arguments_, environment);
    spawnedProcesses.add(process_);
    return tracedProcess(process_, temporaryRoot, spawnedProcesses);
  };
}

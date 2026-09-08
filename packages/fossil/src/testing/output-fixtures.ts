import type { OutputCapture } from "./types/output-capture.js";

/** Captures output through injected writers without replacing process streams. */
export function createOutputCapture(): OutputCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    writeStdout: (text) => stdout.push(text),
    writeStderr: (text) => stderr.push(text),
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
  };
}

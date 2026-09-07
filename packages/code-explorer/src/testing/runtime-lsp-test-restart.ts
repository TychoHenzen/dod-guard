import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";
import type { Process } from "./runtime-test-process.js";
import { Process as RuntimeProcess } from "./runtime-test-process.js";
import { Scheduler } from "./runtime-test-scheduler.js";
import { runtimeSourceOptions } from "./runtime-lsp-test-source.js";

export function restartingSourceFixture() {
  const responseFor = (method: string) =>
    method === "textDocument/definition"
      ? [{ uri: "file:///project/a.rs", range: { start: { line: 0, character: 7 }, end: { line: 0, character: 13 } } }]
      : [];
  const first = new RuntimeProcess([], { definitionProvider: true }, responseFor);
  const replacement = new RuntimeProcess([], { definitionProvider: true }, responseFor);
  const scheduler = new Scheduler();
  const processes: Process[] = [first, replacement];
  const backend = createRuntimeLspBackend(
    runtimeSourceOptions(first, { spawn: () => processes.shift() as Process, scheduler }),
  );
  return { backend, first, replacement, scheduler };
}

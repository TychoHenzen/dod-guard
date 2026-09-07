import assert from "node:assert/strict";
import type { CoreCall } from "../application-core.test.js";

function callValue(args: Record<string, unknown>): unknown {
  if (args.action !== undefined && args.action !== null) return args.action;
  if (args.query !== undefined && args.query !== null) return args.query;
  return args.symbol_id;
}
export function assertCoreCalls(coreCalls: CoreCall[]): void {
  assert.deepEqual(
    coreCalls.map(({ name, arguments_ }) => [name, callValue(arguments_)]),
    [
      ["code_status", "start_session"],
      ["code_status", "status"],
      ["code_search", ""],
      ["code_search", "main"],
      ["code_focus", "symbol-main"],
    ],
  );
}

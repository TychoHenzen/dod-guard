import * as focus from "../../../navigation/focus-relation-names.js";
import { focused } from "./focus-response.test.js";
export const mainFocus = focused({
  symbolId: "symbol-main",
  name: "main",
  kind: "function",
  path: "src/main.ts",
  body: "export function main() { return 1; }",
  handles: [
    {
      handle: "handle-main",
      name: "main",
      symbol_id: "symbol-main",
      start: 16,
      end: 20,
      out_of_range: false,
      relations: focus.browserRelationNames,
    },
  ],
});
export const clientFocus = focused({
  symbolId: "file:src/browser/client.ts",
  name: "client.ts",
  kind: "file",
  path: "src/browser/client.ts",
  body: "export const client = true;",
});

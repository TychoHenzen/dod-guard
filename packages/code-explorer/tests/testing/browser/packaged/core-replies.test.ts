import { clientFocus, mainFocus } from "./focus-replies.test.js";
import { searchReplies } from "./search-replies.test.js";
import { invalidReply, statusReplies } from "./status-replies.test.js";

function selectReply(
  replies: Record<string, Record<string, unknown>>,
  key: unknown,
): Record<string, unknown> {
  if (typeof key !== "string") return invalidReply;
  return Object.hasOwn(replies, key) ? replies[key] : invalidReply;
}

function followReply(
  arguments_: Record<string, unknown>,
): Record<string, unknown> {
  if (arguments_.handle !== "handle-main") return invalidReply;
  return {
    schema_version: 1,
    state: "ready",
    data: { relation: arguments_.relation, candidates: [] },
  };
}

const replyFor: Record<
  string,
  (args: Record<string, unknown>) => Record<string, unknown>
> = {
  code_status: (args) => selectReply(statusReplies, args.action),
  code_search: (args) => selectReply(searchReplies, args.query),
  code_focus: (args) =>
    selectReply(
      {
        "symbol-main": mainFocus,
        "file:src/browser/client.ts": clientFocus,
      },
      args.symbol_id,
    ),
  code_follow: followReply,
};

export function packagedReply(
  name: string,
  arguments_: Record<string, unknown>,
) {
  if (!Object.hasOwn(replyFor, name)) return invalidReply;
  return replyFor[name](arguments_);
}

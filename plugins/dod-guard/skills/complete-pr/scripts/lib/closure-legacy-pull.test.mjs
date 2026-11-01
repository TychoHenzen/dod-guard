// Tests for the record-legacy refusals about the merged pull request: each row changes one field of an
// accepted delivery, and the command must stop with that row's reason before it writes anything.
// biome-ignore-all lint/correctness/noNodejsModules: node:test is the test harness
import { test } from "node:test";
import { expectRefusal } from "./closure-legacy.test-support.mjs";

const MERGE_REASON = "pull request #62 merge commit or head is missing";
const KEYWORD_REASON = "pull request #62 body has no closing keyword for #61";

function setPull(path, key, value) {
  return (fx) => {
    const target = path.reduce((node, name) => node[name], fx.state.pull);
    target[key] = value;
  };
}

const REFUSALS = [
  {
    name: "an unmerged pull request",
    change: setPull([], "merged_at", null),
    reason: "pull request #62 is not merged",
  },
  {
    name: "a base other than the default branch",
    change: setPull(["base"], "ref", "develop"),
    reason: "pull request #62 base is not the default branch",
  },
  {
    name: "a head repository other than the target",
    change: setPull(["head", "repo"], "full_name", "other/r"),
    reason: "pull request #62 head repository is not the target repository",
  },
  { name: "a body that closes another issue", change: setPull([], "body", "Closes #6"), reason: KEYWORD_REASON },
  { name: "a body that only mentions the issue", change: setPull([], "body", "see #61"), reason: KEYWORD_REASON },
  { name: "a missing merge commit", change: setPull([], "merge_commit_sha", null), reason: MERGE_REASON },
  { name: "a missing head sha", change: setPull(["head"], "sha", ""), reason: MERGE_REASON },
];

for (const row of REFUSALS) {
  test(`record-legacy refuses ${row.name} and writes nothing`, () => expectRefusal(row));
}

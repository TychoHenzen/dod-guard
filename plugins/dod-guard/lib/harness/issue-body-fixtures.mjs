import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const body904 = await readFile(new URL("../fixtures/issue-904-body.md", import.meta.url), "utf8");
// The same #904 records, taken from the live body when the fixture was made.
export const records904 = JSON.parse(
  await readFile(new URL("../../skills/next-ticket/scripts/fixtures/issue-904-handoff.json", import.meta.url), "utf8"),
);

export const replaceOnce = (text, from, to) => {
  assert.ok(text.includes(from), `fixture holds ${from}`);
  return text.replace(from, to);
};

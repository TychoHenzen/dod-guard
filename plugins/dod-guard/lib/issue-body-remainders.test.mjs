import assert from "node:assert/strict";
import test from "node:test";
import { body904, replaceOnce } from "./harness/issue-body-fixtures.mjs";
import { parseIssueBodyRecords } from "./issue-body-records.mjs";

test("reports a requirement that no acceptance criterion cites", () => {
  const body = replaceOnce(
    body904,
    "### clarifications\n",
    "- R-99 An extra requirement that no criterion cites.\n\n### clarifications\n",
  );
  assert.deepEqual(parseIssueBodyRecords(body).requirementRemainder, [
    "R-99 requirement is cited by no acceptance criterion",
  ]);
});

test("reports a cited id that is not a requirement", () => {
  const body = replaceOnce(body904, "- [ ] AC-1 ", "- [ ] AC-1 (R-98) ");
  assert.ok(parseIssueBodyRecords(body).requirementRemainder.includes("AC-1 cites R-98 which is not a requirement"));
});

test("matches requirement ids as whole tokens", () => {
  const body = replaceOnce(
    body904,
    "### clarifications\n",
    "- R-19 An extra requirement that no criterion cites.\n\n### clarifications\n",
  );
  assert.deepEqual(parseIssueBodyRecords(body).requirementRemainder, [
    "R-19 requirement is cited by no acceptance criterion",
  ]);

  const citesR19 = replaceOnce(body904, "- [ ] AC-1 ", "- [ ] AC-1 (R-19) ");
  assert.ok(
    parseIssueBodyRecords(citesR19).requirementRemainder.includes("AC-1 cites R-19 which is not a requirement"),
  );
});

test("reports a repeated requirement id", () => {
  const body = replaceOnce(body904, "### clarifications\n", "- R-1 A repeated id.\n\n### clarifications\n");
  assert.ok(parseIssueBodyRecords(body).requirementRemainder.includes("R-1 requirement id is repeated"));
});

test("reports a requirements record that holds no R-n requirement", () => {
  const body = body904.replace(
    /### requirements\n[\s\S]*?(?=### clarifications)/,
    "### requirements\n\n- A bullet with no id.\n\n",
  );
  assert.deepEqual(parseIssueBodyRecords(body).requirementRemainder, ["requirements record has no R-n requirement"]);
});

const PLACEHOLDER_HEAD = "0000000000000000000000000000000000000000";

test("reports a head stored in a lens-ownership entry", () => {
  const stored = replaceOnce(
    body904,
    '{"id": "implementation", "owner": "T1",',
    `{"id": "implementation", "headSha": "${PLACEHOLDER_HEAD}", "owner": "T1",`,
  );
  assert.deepEqual(parseIssueBodyRecords(stored).lensHeadRemainder, [
    "lens-ownership entry implementation stores headSha; store no head",
  ]);
  const aliased = replaceOnce(body904, '{"id": "quality", "owner":', '{"id": "quality", "head": "abc", "owner":');
  assert.deepEqual(parseIssueBodyRecords(aliased).lensHeadRemainder, [
    "lens-ownership entry quality stores head; store no head",
  ]);
});

test("reports no stored head for lens entries that omit it", () => {
  assert.deepEqual(parseIssueBodyRecords(body904).lensHeadRemainder, []);
  const notArray = body904.replace(
    /### lens-ownership\n[\s\S]*?```json\n[\s\S]*?\n```/,
    "### lens-ownership\n\n```json\n{}\n```",
  );
  assert.deepEqual(parseIssueBodyRecords(notArray).lensHeadRemainder, []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parkedRecords, renderParkedRecord } from "./parked-record.mjs";

const FIELDS = { blocked: "the owner has not answered", unblocksWhen: "the owner answers the open question" };

test("a rendered record is read back with both fields and its comment id", () => {
  const body = renderParkedRecord(FIELDS);
  assert.equal(
    body,
    "## Parked\n\n<!-- dod-guard-parked -->\n\nBlocked: the owner has not answered\nUnblocks when: the owner answers the open question",
  );
  assert.deepEqual(parkedRecords([{ id: 7, body }]), [{ commentId: 7, ...FIELDS }]);
});

test("CRLF line endings are normalized before the record is read", () => {
  const body = renderParkedRecord(FIELDS).replace(/\n/gu, "\r\n");
  assert.deepEqual(parkedRecords([{ id: 8, body }]), [{ commentId: 8, ...FIELDS }]);
});

test("a comment that only quotes the marker, or starts with a different heading, is not a record", () => {
  const comments = [
    { id: 1, body: `Quoted above:\n\n${renderParkedRecord(FIELDS)}` },
    { id: 2, body: "## Parked\n\n<!-- dod-guard-parked --> and more on the same line" },
    { id: 3, body: "## Parked later\n\n<!-- dod-guard-parked -->\n" },
    { id: 4, body: "<!-- dod-guard-parked -->\n\n## Parked" },
    { id: 5, body: null },
  ];
  assert.deepEqual(parkedRecords(comments), []);
});

test("a record with missing field lines still parks and reads each missing field as not stated", () => {
  assert.deepEqual(parkedRecords([{ id: 9, body: "## Parked\n\n<!-- dod-guard-parked -->" }]), [
    { commentId: 9, blocked: "not stated", unblocksWhen: "not stated" },
  ]);
});

test("every record is returned in comment order, and a non-array is no comments", () => {
  const first = { id: 1, body: renderParkedRecord(FIELDS) };
  const second = { id: 2, body: renderParkedRecord({ blocked: "b", unblocksWhen: "u" }) };
  assert.deepEqual(
    parkedRecords([first, { id: 3, body: "plain" }, second]).map(({ commentId }) => commentId),
    [1, 2],
  );
  assert.deepEqual(parkedRecords(undefined), []);
});

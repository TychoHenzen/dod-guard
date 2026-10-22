import assert from "node:assert/strict";
import test from "node:test";
import { OWNER, PROJECT_NUMBER, REPOSITORY } from "./fixtures/lifecycle-constants.mjs";
import { createRecordingTransport } from "./lifecycle-fixture.mjs";

const ITEMS = `users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`;
const ISSUES = `repos/${REPOSITORY}/issues`;
const MARKER_660 = "body=<!-- dod-guard:lifecycle-fixture:660 -->";
const PARENT_ITEM_ID = 256_202_824;
const DONE_OPTION_ID = "98236657";

function addIssueItem(transport, issueId) {
  return transport.commandRunner(["api", "--method", "POST", ITEMS, "-f", "type=Issue", "-F", `id=${issueId}`]);
}

function parentWithItem(options = {}) {
  const transport = createRecordingTransport({ ...options, existingIssueNumbers: [660] });
  addIssueItem(transport, 900_660);
  return transport;
}

test("fixture refuses any GraphQL text before it routes the endpoint, and records the call", () => {
  const transport = createRecordingTransport();
  assert.throws(() => transport.commandRunner(["api", `repos/${REPOSITORY}`, "-f", "x=GraphQL"]), {
    message: "Forbidden routine GraphQL request.",
  });
  assert.equal(transport.calls.length, 1);
});

test("fixture throws Unexpected command for unrouted endpoints and methods", () => {
  const transport = createRecordingTransport();
  for (const [args, text] of [
    [["api", `repos/${REPOSITORY}/unknown`], `api repos/${REPOSITORY}/unknown`],
    [["pr", "view"], "pr view"],
    [
      ["api", "--method", "POST", `${ISSUES}?state=all&per_page=100`],
      `api --method POST ${ISSUES}?state=all&per_page=100`,
    ],
    [["api", "--method", "DELETE", `${ITEMS}/1`], `api --method DELETE ${ITEMS}/1`],
  ]) {
    assert.throws(() => transport.commandRunner(args), { message: `Unexpected command: ${text}` });
  }
});

test("fixture rejects an issue create with no, unknown, or repeated lifecycle marker", () => {
  const transport = createRecordingTransport();
  const create = (...fields) => transport.commandRunner(["api", "--method", "POST", ISSUES, ...fields]);
  const noMarker = { message: "Issue create requires the exact lifecycle marker." };
  assert.throws(() => create(), noMarker);
  assert.throws(() => create("-f", "body=no marker"), noMarker);
  assert.throws(() => create("-f", "body=<!-- dod-guard:lifecycle-fixture:999 -->"), {
    message: "Unknown lifecycle issue marker 999.",
  });
  assert.equal(create("-f", MARKER_660).status, 0);
  assert.throws(() => create("-f", MARKER_660), { message: "Lifecycle issue 660 already exists." });
});

test("fixture titles a create without title= as Disposable fixture N", () => {
  const transport = createRecordingTransport();
  const reply = transport.commandRunner(["api", "--method", "POST", ISSUES, "-f", MARKER_660]);
  assert.equal(JSON.parse(reply.stdout).title, "Disposable fixture 660");
});

test("fixture rejects unknown child and unknown issue lookups", () => {
  const transport = createRecordingTransport({ existingIssueNumbers: [660] });
  assert.throws(
    () => transport.commandRunner(["api", "--method", "POST", `${ISSUES}/660/sub_issues`, "-F", "sub_issue_id=1"]),
    { message: "Unknown child issue 1." },
  );
  assert.throws(() => transport.commandRunner(["api", `${ISSUES}/999`]), { message: "Unknown issue 999." });
  assert.equal(transport.commandRunner(["api", `${ISSUES}/660/sub_issues`]).stdout, "[]");
});

test("fixture rejects an add-item for an unknown issue id", () => {
  const transport = createRecordingTransport();
  assert.throws(() => addIssueItem(transport, 12_345), { message: "Unknown project item issue 12345." });
});

test("fixture serves the page= items route as one slurped page that ignores contradictoryStatus", () => {
  const transport = createRecordingTransport({ contradictoryStatus: true, existingIssueNumbers: [660] });
  assert.equal(transport.commandRunner(["api", `${ITEMS}?per_page=100&page=1`]).stdout, "[[]]");
  addIssueItem(transport, 900_660);
  const page = JSON.parse(transport.commandRunner(["api", `${ITEMS}?per_page=100&page=1`]).stdout);
  assert.equal(page.length, 1);
  assert.equal(page[0].length, 1);
  assert.equal(page[0][0].content.number, 660);
  assert.deepEqual(page[0][0].fields[0].value.name, { raw: "Backlog" });
});

test("fixture lists items slurped as one array and unslurped as one JSON line per item", () => {
  const transport = parentWithItem({ contradictoryStatus: true });
  const slurped = transport.commandRunner(["api", "--paginate", "--slurp", `${ITEMS}?per_page=100`]);
  const pages = JSON.parse(slurped.stdout);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0][0].fields[0].value.name, { raw: "Backlog", html: "Done" });
  const lines = transport.commandRunner(["api", "--paginate", "--jq", ".[]", `${ITEMS}?per_page=100`]);
  assert.equal(lines.stdout, JSON.stringify(pages[0][0]));
});

test("fixture contradicts a Done parent with a Todo html name", () => {
  const transport = parentWithItem({ contradictoryStatus: true });
  const patched = transport.commandRunner([
    "api",
    "--method",
    "PATCH",
    `${ITEMS}/${PARENT_ITEM_ID}`,
    "-f",
    `fields[][value]=${DONE_OPTION_ID}`,
  ]);
  assert.deepEqual(JSON.parse(patched.stdout).fields[0].value.name, { raw: "Done" });
  const pages = JSON.parse(transport.commandRunner(["api", "--paginate", "--slurp", `${ITEMS}?per_page=100`]).stdout);
  assert.deepEqual(pages[0][0].fields[0].value.name, { raw: "Done", html: "Todo" });
});

test("fixture rejects an unknown project item readback", () => {
  const transport = parentWithItem();
  assert.throws(() => transport.commandRunner(["api", `${ITEMS}/999999`]), {
    message: "Unknown project item readback 999999.",
  });
});

test("fixture rejects a status mutation for an unknown item or unknown option", () => {
  const transport = parentWithItem();
  const patch = (itemId, optionId) =>
    transport.commandRunner(["api", "--method", "PATCH", `${ITEMS}/${itemId}`, "-f", `fields[][value]=${optionId}`]);
  assert.throws(() => patch(999_999, DONE_OPTION_ID), { message: "Unknown project status mutation 999999." });
  assert.throws(() => patch(PARENT_ITEM_ID, "nope"), { message: `Unknown project status mutation ${PARENT_ITEM_ID}.` });
});

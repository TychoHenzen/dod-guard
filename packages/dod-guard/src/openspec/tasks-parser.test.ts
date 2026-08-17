// Requirement: none - see Task
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTaskGroups, parseTasksMarkdown, writeTaskStatus } from "./tasks-parser.js";

test("parses a checked and an unchecked item with their ids and text", () => {
  const items = parseTasksMarkdown(
    ["## 1. Section", "", "- [x] 1.1 Delete the old thing", "- [ ] 1.2 Add the new thing"].join("\n"),
  );
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { id: "1.1", text: "Delete the old thing", checked: true, coversId: undefined });
  assert.deepEqual(items[1], { id: "1.2", text: "Add the new thing", checked: false, coversId: undefined });
});

test("joins indented continuation lines into the item's text", () => {
  const items = parseTasksMarkdown(
    ["- [ ] 1.1 Delete the old thing", "      and its test file too", "- [ ] 1.2 Next item"].join("\n"),
  );
  assert.equal(items[0].text, "Delete the old thing and its test file too");
});

test("reads a covers annotation into coversId", () => {
  const items = parseTasksMarkdown(
    [
      "- [ ] 4.6 Write the test",
      "<!-- covers: dod-guard/steps-generation :: a task item becomes a verified step :: Tasks convert in order -->",
    ].join("\n"),
  );
  assert.equal(
    items[0].coversId,
    "dod-guard/steps-generation::a task item becomes a verified step||Tasks convert in order",
  );
});

test("falls back to a running index when the item has no leading id token", () => {
  const items = parseTasksMarkdown(["- [ ] just a sentence with no id"].join("\n"));
  assert.equal(items[0].id, "1");
  assert.equal(items[0].text, "just a sentence with no id");
});

test("stops an item's continuation at the next checkbox line", () => {
  const items = parseTasksMarkdown(["- [ ] 1.1 First", "- [ ] 1.2 Second"].join("\n"));
  assert.equal(items[0].text, "First");
  assert.equal(items[1].text, "Second");
});

test("stops an item's continuation at the next heading", () => {
  const items = parseTasksMarkdown(["- [ ] 1.1 First", "## 2. Next section", "- [ ] 2.1 Second"].join("\n"));
  assert.equal(items[0].text, "First");
  assert.equal(items.length, 2);
});

test("returns an empty array for content with no checkbox lines", () => {
  assert.deepEqual(parseTasksMarkdown("## Just a heading\n\nSome prose.\n"), []);
});

test("reads a status metadata comment", () => {
  const items = parseTasksMarkdown(["- [ ] 1.1 Do the thing", "<!-- status: blocked -->"].join("\n"));
  assert.equal(items[0].status, "blocked");
});

test("reads a verify_cmd metadata comment", () => {
  const items = parseTasksMarkdown(["- [ ] 1.1 Do the thing", "<!-- verify_cmd: npm test -->"].join("\n"));
  assert.equal(items[0].verifyCmd, "npm test");
});

test("reads a verify_surface metadata comment", () => {
  const items = parseTasksMarkdown(["- [ ] 1.1 Do the thing", "<!-- verify_surface: visual -->"].join("\n"));
  assert.equal(items[0].verifySurface, "visual");
});

test("reads a manual_required metadata comment as a boolean", () => {
  const items = parseTasksMarkdown(["- [ ] 1.1 Do the thing", "<!-- manual_required: true -->"].join("\n"));
  assert.equal(items[0].manualRequired, true);
});

test("writeTaskStatus flips a checkbox from unchecked to checked", () => {
  const content = writeTaskStatus("- [ ] 1.1 Do the thing", "1.1", { checked: true });
  assert.equal(content, "- [x] 1.1 Do the thing");
});

test("writeTaskStatus round-trips a status update through parseTasksMarkdown", () => {
  const content = writeTaskStatus("- [ ] 1.1 Do the thing", "1.1", { status: "blocked" });
  const items = parseTasksMarkdown(content);
  assert.equal(items[0].status, "blocked");
});

// covers: dod-guard/coverage-gate :: The task parser exposes group headings and their items :: Groups and items are reported together
test("reports group headings with the items that fall under each one", () => {
  const content = ["## 1. First group", "- [ ] 1.1 First item", "- [ ] 1.2 Second item", "## 2. Second group"].join(
    "\n",
  );
  const groups = parseTaskGroups(content);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "1");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].id, "2");
  assert.equal(groups[1].items.length, 0);
  assert.equal(parseTasksMarkdown(content).length, 2);
});

// covers: dod-guard/coverage-gate :: The task parser exposes group headings and their items :: Items above the first group heading still parse
test("reports an item above the first group heading as a task with no group", () => {
  const content = ["- [ ] 0.1 Ungrouped item", "## 1. First group", "- [ ] 1.1 Grouped item"].join("\n");
  const items = parseTasksMarkdown(content);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "0.1");
  assert.equal(items[1].id, "1.1");
  const groups = parseTaskGroups(content);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].id, "1.1");
});

test("writeTaskStatus preserves existing metadata when updating status", () => {
  const original = ["- [ ] 1.1 Do the thing", "<!-- verify_cmd: npm test -->", "<!-- status: pending -->"].join("\n");
  const content = writeTaskStatus(original, "1.1", { status: "skipped" });
  const items = parseTasksMarkdown(content);
  assert.equal(items[0].status, "skipped");
  assert.equal(items[0].verifyCmd, "npm test");
});

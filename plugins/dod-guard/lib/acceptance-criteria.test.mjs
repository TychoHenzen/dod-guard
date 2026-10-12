import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceCriteria, markdownSection } from "./acceptance-criteria.mjs";

test("markdownSection returns one heading's text and matches the heading literally", () => {
  const body = [
    "## Notes draft",
    "",
    "Decoy section.",
    "",
    "## Notes (draft)",
    "",
    "First line.",
    "### sub",
    "Second line.",
    "",
    "## Last",
    "",
    "Tail.",
    "",
  ].join("\n");
  assert.equal(
    markdownSection(body, "Notes (draft)"),
    "\nFirst line.\n### sub\nSecond line.\n\n",
  );
  assert.equal(markdownSection(body, "Last"), "\nTail.\n");
  assert.equal(markdownSection(body, "Missing"), "");
  assert.equal(
    markdownSection("## Last\r\n\r\nTail.\r\n", "Last"),
    "\nTail.\n",
  );
  assert.equal(markdownSection("Preamble\n## Last", "Last"), "");
});

const CRITERIA_BODY =
  "## Outcome\n\n- [ ] not a criterion\n\n## Acceptance criteria\n\n- [ ] AC-01 first\n" +
  "- [x] AC-02 second\n  - [X] nested third\n- plain bullet\n* [ ] star bullet\n\n" +
  "## Verification\n\n- [ ] not a criterion\n";
const CRITERIA = [
  { text: "AC-01 first", checked: false },
  { text: "AC-02 second", checked: true },
  { text: "nested third", checked: true },
];

test("acceptanceCriteria returns checked and unchecked items in document order", () => {
  assert.deepEqual(acceptanceCriteria(CRITERIA_BODY), CRITERIA);
});

test("acceptanceCriteria reads CRLF bodies", () => {
  assert.deepEqual(
    acceptanceCriteria(CRITERIA_BODY.replace(/\n/g, "\r\n")),
    CRITERIA,
  );
});

test("acceptanceCriteria returns no items without the section or without checkboxes", () => {
  assert.deepEqual(acceptanceCriteria("## Outcome\n\n- [ ] x\n"), []);
  assert.deepEqual(
    acceptanceCriteria("## Acceptance criteria\n\n- plain\n"),
    [],
  );
  assert.deepEqual(acceptanceCriteria(null), []);
  assert.deepEqual(acceptanceCriteria(undefined), []);
});

test("acceptanceCriteria skips a fenced example above the heading", () => {
  const body = [
    "## Outcome",
    "",
    "```md",
    "## Acceptance criteria",
    "- [ ] example only",
    "```",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] AC-01 first",
    "- [x] AC-02 second",
    "",
    "## Verification",
    "",
    "- [ ] not a criterion",
  ].join("\n");
  assert.deepEqual(acceptanceCriteria(body), [
    { text: "AC-01 first", checked: false },
    { text: "AC-02 second", checked: true },
  ]);
  assert.equal(
    markdownSection(body, "Acceptance criteria"),
    "\n- [ ] AC-01 first\n- [x] AC-02 second\n\n",
  );
});

test("acceptanceCriteria skips a fenced checkbox inside the section", () => {
  const body = [
    "## Acceptance criteria",
    "",
    "- [ ] AC-01 first",
    "",
    "```text",
    "- [ ] fenced item",
    "## Not a heading",
    "```",
    "",
    "- [x] AC-02 second",
    "",
    "## Verification",
    "",
    "- [ ] not a criterion",
  ].join("\n");
  assert.deepEqual(acceptanceCriteria(body), [
    { text: "AC-01 first", checked: false },
    { text: "AC-02 second", checked: true },
  ]);
});

test("a tilde fence hides its contents until a tilde line closes it", () => {
  const body = [
    "~~~",
    "## Acceptance criteria",
    "- [ ] tilde example",
    "~~~",
    "",
    "## Acceptance criteria",
    "",
    "~~~",
    "- [ ] tilde fenced",
    "```",
    "- [ ] still fenced",
    "## Not a heading",
    "~~~",
    "",
    "- [ ] AC-01 real",
  ].join("\n");
  assert.deepEqual(acceptanceCriteria(body), [
    { text: "AC-01 real", checked: false },
  ]);
});

test("an inline triple-backtick line does not hide the next checkbox", () => {
  const body = [
    "## Acceptance criteria",
    "",
    "```inline```",
    "- [ ] AC-01 after inline",
    "",
    "## Verification",
  ].join("\n");
  assert.deepEqual(acceptanceCriteria(body), [
    { text: "AC-01 after inline", checked: false },
  ]);
});

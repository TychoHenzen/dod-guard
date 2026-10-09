import assert from "node:assert/strict";
import test from "node:test";
import {
  markdownSection,
  parseCompletionRecord,
  parseSupersedes,
  pendingMatrixRows,
  renderCompletionRecord,
} from "./closure-records.mjs";
import { DELIVERIES, REPOSITORY, completionComment, supersedesBody } from "./closure.test-support.mjs";

test("parses the supersedes record under Implementation notes", () => {
  assert.deepEqual(parseSupersedes(supersedesBody([777]), REPOSITORY), { numbers: [777] });
  assert.deepEqual(parseSupersedes("## Outcome\n\nNo record.\n", REPOSITORY), { numbers: [] });
  const outsideNotes = "## Acceptance criteria\n\n### supersedes\n\n```json\n[777]\n```\n";
  assert.deepEqual(parseSupersedes(outsideNotes, REPOSITORY), { numbers: [] });
});

test("holds a malformed, cross-repository, or duplicate supersedes record with a named reason", () => {
  const cases = [
    [supersedesBody(["#777"]), 'supersedes record has malformed entry "#777"'],
    [supersedesBody(["Other/repo#777"]), "supersedes record names cross-repository issue Other/repo#777"],
    [supersedesBody([777, 777]), "supersedes record repeats an issue number"],
    [supersedesBody([]), "supersedes record is not a non-empty array"],
    [supersedesBody([777]).replace("[777]", "[777,"), "supersedes record is not valid JSON"],
    [`${supersedesBody([777])}\n### supersedes\n\n\`\`\`json\n[778]\n\`\`\`\n`, "duplicate supersedes record"],
  ];
  for (const [body, error] of cases) assert.deepEqual(parseSupersedes(body, REPOSITORY), { error });
});

test("renders and parses one completion evidence record", () => {
  const comment = completionComment(840, { pendingRows: ["AC-11"] });
  assert.match(comment.body, /^## Completion evidence\n\n<!-- dod-guard-completion-evidence -->\n/);
  assert.deepEqual(parseCompletionRecord([{ id: 1, body: "unrelated" }, comment]), {
    record: {
      commentId: comment.id,
      pullRequest: DELIVERIES[840].pull,
      mergeCommit: DELIVERIES[840].merge,
      trustedHeadSha: DELIVERIES[840].head,
      requiredChecks: "pass",
      pendingRows: ["AC-11"],
    },
  });
  assert.deepEqual(parseCompletionRecord([{ id: 1, body: "unrelated" }]), { record: null });
});

test("rejects a duplicate or malformed completion evidence record", () => {
  const comment = completionComment(840);
  assert.deepEqual(parseCompletionRecord([comment, { ...comment, id: 2 }]), {
    error: "duplicate completion evidence record",
  });
  const shortSha = { id: 3, body: comment.body.replace(DELIVERIES[840].head, "abc123") };
  assert.deepEqual(parseCompletionRecord([shortSha]), {
    error: "completion evidence record has no full trusted head SHA",
  });
  const headless = { id: 4, body: comment.body.replace("## Completion evidence", "Completion") };
  assert.deepEqual(parseCompletionRecord([headless]), { error: "completion evidence record lacks its heading" });
});

test("counts every matrix row that is neither pass nor inapplicable as pending", () => {
  const rows = [
    { id: "AC-01", status: "pass" },
    { id: "AC-02", status: "inapplicable" },
    { id: "AC-03", status: "unverified" },
    { id: "AC-04", status: "blocked" },
  ];
  assert.deepEqual(pendingMatrixRows(rows), ["AC-03", "AC-04"]);
  assert.deepEqual(pendingMatrixRows({ rows }), ["AC-03", "AC-04"]);
  assert.throws(() => pendingMatrixRows(null), /acceptance matrix must be an array/);
  const record = renderCompletionRecord({
    pullRequest: 901,
    mergeCommit: DELIVERIES[840].merge,
    trustedHeadSha: DELIVERIES[840].head,
    requiredChecks: "pass",
    pendingRows: pendingMatrixRows(rows),
  });
  assert.deepEqual(parseCompletionRecord([{ id: 5, body: record }]).record.pendingRows, ["AC-03", "AC-04"]);
});

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
  assert.equal(markdownSection(body, "Notes (draft)"), "\nFirst line.\n### sub\nSecond line.\n\n");
  assert.equal(markdownSection(body, "Last"), "\nTail.\n");
  assert.equal(markdownSection(body, "Missing"), "");
  assert.equal(markdownSection("## Last\r\n\r\nTail.\r\n", "Last"), "\nTail.\n");
  assert.equal(markdownSection("Preamble\n## Last", "Last"), "");
});

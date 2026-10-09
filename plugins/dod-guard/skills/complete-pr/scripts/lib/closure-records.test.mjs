import assert from "node:assert/strict";
import test from "node:test";
import {
  isRecord,
  markdownSection,
  parseCompletionRecord,
  parseSupersedes,
  pendingMatrixRows,
  recordComments,
  renderClosureEvidence,
  renderCompletionRecord,
} from "./closure-records.mjs";
import { DELIVERIES, REPOSITORY, completionComment, quotingComment, supersedesBody } from "./closure.test-support.mjs";

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
});

test("a comment is a record only when it begins with the heading, a blank line, and the marker", () => {
  const completion = completionComment(840).body;
  const closure = renderClosureEvidence({ issue: 777, stateReason: "completed", evidence: ["Superseded by #840."] });
  assert.equal(isRecord({ body: completion }, "completion"), true);
  assert.equal(isRecord({ body: closure }, "closure"), true);
  assert.equal(isRecord({ body: completion }, "closure"), false);
  assert.equal(isRecord({ body: closure }, "completion"), false);
  assert.equal(isRecord({ body: completion.replace(/\n/g, "\r\n") }, "completion"), true);
  assert.equal(isRecord({ body: "## Closure evidence\n\n<!-- dod-guard-closure-evidence -->" }, "closure"), true);
  assert.equal(isRecord({ body: "## Closure evidence\n\n<!-- dod-guard-closure-evidence -->\n" }, "closure"), true);
  const notRecords = [
    ["marker inline mid-text", "See `<!-- dod-guard-completion-evidence -->` in the record."],
    [
      "marker in a fenced block",
      "Example:\n\n```text\n## Completion evidence\n\n<!-- dod-guard-completion-evidence -->\n```\n",
    ],
    [
      "heading and marker under another heading",
      "## Implementation handoff\n\n## Completion evidence\n\n<!-- dod-guard-completion-evidence -->\n",
    ],
    ["headless marker", completion.replace("## Completion evidence\n\n", "")],
    ["renamed heading", completion.replace("## Completion evidence", "Completion")],
    ["leading blank line", `\n${completion}`],
    ["leading space", ` ${completion}`],
    ["text glued after the marker", "## Completion evidence\n\n<!-- dod-guard-completion-evidence -->trailing"],
    ["no blank line between heading and marker", "## Completion evidence\n<!-- dod-guard-completion-evidence -->\n"],
  ];
  for (const [name, body] of notRecords) {
    assert.equal(isRecord({ body }, "completion"), false, name);
  }
  assert.equal(isRecord(quotingComment(7001), "completion"), false);
  assert.equal(isRecord(quotingComment(7001), "closure"), false);
  assert.equal(isRecord(null, "completion"), false);
  assert.equal(isRecord({ body: 42 }, "completion"), false);
  assert.equal(isRecord({}, "closure"), false);
  assert.throws(() => isRecord({ body: completion }, "evidence"), /unknown closure record kind: evidence/);
  assert.deepEqual(
    recordComments([quotingComment(7001), { id: 2, body: completion }, { id: 3, body: closure }], "completion"),
    [{ id: 2, body: completion }],
  );
  assert.deepEqual(recordComments(undefined, "closure"), []);
});

test("parseCompletionRecord reads only real records beside a quoting comment", () => {
  const record = completionComment(840);
  const quote = quotingComment(7001);
  const parsed = parseCompletionRecord([quote, record]);
  assert.equal(parsed.record.commentId, record.id);
  assert.equal(parsed.record.pullRequest, DELIVERIES[840].pull);
  assert.deepEqual(parseCompletionRecord([quote]), { record: null });
  const headless = { id: 4, body: record.body.replace("## Completion evidence\n\n", "") };
  assert.deepEqual(parseCompletionRecord([headless]), { record: null });
  const renamed = { id: 4, body: record.body.replace("## Completion evidence", "Completion") };
  assert.deepEqual(parseCompletionRecord([renamed]), { record: null });
  assert.deepEqual(parseCompletionRecord([quote, record, { ...record, id: 2 }]), {
    error: "duplicate completion evidence record",
  });
});

test("a real record with broken JSON is reported as malformed, not skipped", () => {
  const broken = { id: 555, body: completionComment(840).body.replace('"pullRequest"', '"pullRequest" oops') };
  assert.equal(isRecord(broken, "completion"), true);
  const [, json] = /```json\n([\s\S]*?)\n```/.exec(broken.body);
  assert.throws(() => JSON.parse(json), SyntaxError);
  assert.deepEqual(parseCompletionRecord([quotingComment(7001), broken]), {
    error: "completion evidence record is not valid JSON",
  });
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

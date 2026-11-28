import assert from "node:assert/strict";
import test from "node:test";
import { indexSnapshot } from "./closure-index.mjs";
import { rootsNaming, supersedesRecords } from "./supersedes-record.mjs";

const REPOSITORY = "TychoHenzen/dod-guard";
const FENCE = "`".repeat(3);

function body(json) {
  return ["## Implementation notes", "", "### supersedes", "", `${FENCE}json`, json, FENCE, ""].join("\n");
}

function index(issues) {
  return indexSnapshot({ repository: REPOSITORY, issues });
}

function issue(number, issueBody) {
  return { number, repository: REPOSITORY, body: issueBody };
}

test("reads each root's record under Implementation notes", () => {
  const outsideNotes = body("[778]").split("\n");
  outsideNotes[0] = "## Acceptance criteria";
  const { roots, errors } = supersedesRecords(
    index([issue(840, body("[777]")), issue(841, "## Outcome\n\nNo record.\n"), issue(842, outsideNotes.join("\n"))]),
  );
  assert.deepEqual([...roots], [[840, [777]]]);
  assert.deepEqual(errors, []);
  assert.deepEqual(rootsNaming(roots, 777), [840]);
  assert.deepEqual(rootsNaming(roots, 778), []);
});

test("names each unreadable record with the parser's reason", () => {
  const cases = [
    [body('["#777"]'), 'supersedes record has malformed entry "#777"'],
    [body('["Other/repo#777"]'), "supersedes record names cross-repository issue Other/repo#777"],
    [body("[777,777]"), "supersedes record repeats an issue number"],
    [body("[]"), "supersedes record is not a non-empty array"],
    [body("[777,"), "supersedes record is not valid JSON"],
    [`${body("[777]")}\n${body("[778]").replace("## Implementation notes\n\n", "")}`, "duplicate supersedes record"],
  ];
  for (const [issueBody, reason] of cases) {
    const { roots, errors } = supersedesRecords(index([issue(900, issueBody)]));
    assert.deepEqual(errors, [{ issue: 900, reasons: [reason] }]);
    assert.equal(roots.size, 0);
  }
});

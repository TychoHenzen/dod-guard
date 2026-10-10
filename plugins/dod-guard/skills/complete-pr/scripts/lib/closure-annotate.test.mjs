import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { annotateSnapshot } from "./closure-delivery.mjs";
import {
  DELIVERIES,
  FOREIGN_REPOSITORY,
  REPOSITORY,
  completionComment,
  issue,
  item,
  pull,
  recordedSnapshot,
  setField,
} from "./closure.test-support.mjs";

function issueOf(snapshot, number) {
  return snapshot.issues.find((entry) => entry.number === number);
}

function pullOf(snapshot, number) {
  return snapshot.pullRequests.find((entry) => entry.number === number);
}

test("annotate takes the checkpoint and trusted head from the completion records", () => {
  const snapshot = recordedSnapshot({ record: { 841: { pendingRows: ["AC-11"] } } });
  issueOf(snapshot, 841).activeCheckpoint = false;
  const annotated = annotateSnapshot(snapshot);
  assert.equal(issueOf(annotated, 840).activeCheckpoint, false);
  assert.equal(pullOf(annotated, DELIVERIES[840].pull).trustedHeadSha, DELIVERIES[840].head);
  assert.equal(Object.hasOwn(issueOf(annotated, 841), "activeCheckpoint"), false);
  assert.equal(pullOf(annotated, DELIVERIES[841].pull).trustedHeadSha, DELIVERIES[841].head);
  assert.equal(Object.hasOwn(issueOf(annotated, 777), "activeCheckpoint"), false);
  assert.equal(Object.hasOwn(issueOf(snapshot, 840), "activeCheckpoint"), false, "the input is not modified");
});

test("annotate leaves a pull request untrusted when two records disagree on its head", () => {
  const snapshot = recordedSnapshot();
  issueOf(snapshot, 777).comments = [completionComment(840, { trustedHeadSha: "f".repeat(40) })];
  pullOf(snapshot, DELIVERIES[840].pull).trustedHeadSha = DELIVERIES[840].head;
  const annotated = annotateSnapshot(snapshot);
  assert.equal(Object.hasOwn(pullOf(annotated, DELIVERIES[840].pull), "trustedHeadSha"), false);
});

// A foreign record with the same number as a target record, and carrying a completion record that
// disagrees with the target's, must change nothing: only target-repository records are annotated.
test("annotate leaves a foreign pull request and issue unannotated", () => {
  const snapshot = recordedSnapshot();
  snapshot.pullRequests.push(pull(840, { repository: FOREIGN_REPOSITORY }));
  const disagreeing = completionComment(840, { trustedHeadSha: "f".repeat(40) });
  snapshot.issues.push(issue(777, { repository: FOREIGN_REPOSITORY, state: "closed", comments: [disagreeing] }));
  const annotated = annotateSnapshot(snapshot);
  assert.deepEqual(annotated.pullRequests.at(-1), snapshot.pullRequests.at(-1), "foreign pull request is unchanged");
  assert.deepEqual(annotated.issues.at(-1), snapshot.issues.at(-1), "foreign issue is unchanged");
  assert.equal(pullOf(annotated, DELIVERIES[840].pull).trustedHeadSha, DELIVERIES[840].head);
});

// A relation that leaves the target repository is kept as read. The queue classifier holds the issue
// for it, so annotate must not hide the relation by removing it.
test("annotate keeps a child list or parent that leaves the target repository", () => {
  const snapshot = recordedSnapshot();
  issueOf(snapshot, 683).children.push({ repository: FOREIGN_REPOSITORY, number: 12 });
  issueOf(snapshot, 777).parent = { repository: "TychoHenzen/BeeHAIve", number: 5 };
  issueOf(snapshot, 776).parent = { number: 683 };
  const annotated = annotateSnapshot(snapshot);
  assert.deepEqual(issueOf(annotated, 683).children.at(-1), { repository: FOREIGN_REPOSITORY, number: 12 });
  assert.deepEqual(issueOf(annotated, 777).parent, { repository: "TychoHenzen/BeeHAIve", number: 5 });
  assert.deepEqual(issueOf(annotated, 776).parent, { number: 683 });
  assert.deepEqual(issueOf(annotated, 778).parent, { repository: REPOSITORY, number: 683 });
});

test("annotate keeps a child list whose every entry is a target reference", () => {
  const annotated = annotateSnapshot(recordedSnapshot());
  assert.equal(issueOf(annotated, 683).children.length, 4);
});

// Removes the two fields annotate may write, so what remains is every other field, relations included.
function withoutAnnotations(snapshot) {
  const copy = structuredClone(snapshot);
  copy.issues = copy.issues.map(({ activeCheckpoint, ...rest }) => rest);
  copy.pullRequests = copy.pullRequests.map(({ trustedHeadSha, ...rest }) => rest);
  return copy;
}

test("annotate changes only activeCheckpoint and trustedHeadSha", () => {
  const snapshot = recordedSnapshot();
  const epic = 683;
  const replaced = 777;
  const root = 840;
  const foreignChild = 12;
  const foreignParent = 5;
  issueOf(snapshot, epic).children.push({ repository: FOREIGN_REPOSITORY, number: foreignChild });
  issueOf(snapshot, replaced).parent = { repository: FOREIGN_REPOSITORY, number: foreignParent };
  const before = structuredClone(snapshot);
  const annotated = annotateSnapshot(snapshot);
  assert.equal(issueOf(annotated, root).activeCheckpoint, false);
  assert.equal(pullOf(annotated, DELIVERIES[root].pull).trustedHeadSha, DELIVERIES[root].head);
  assert.deepEqual(withoutAnnotations(annotated), withoutAnnotations(snapshot));
  assert.deepEqual(snapshot, before, "the input is not modified");
});

const SELECT_NEXT = fileURLToPath(new URL("../../../goal-sdlc/scripts/select-next.mjs", import.meta.url));

// select-next exports no function, so the test runs it as a child process on the annotated snapshot.
async function selectNext(snapshot) {
  const directory = await mkdtemp(join(tmpdir(), "annotate-select-next-"));
  const file = join(directory, "snapshot.json");
  await writeFile(file, JSON.stringify(snapshot));
  const run = spawnSync(process.execPath, [SELECT_NEXT, `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

// A Todo issue with no Project parent, whose issue names a foreign parent. Project item 950 is the
// only item, so no other group can be selected.
function unparentedWithForeignParent() {
  const snapshot = {
    repository: REPOSITORY,
    defaultBranch: "master",
    items: [item(950, "Todo")],
    issues: [issue(950)],
    pullRequests: [],
  };
  issueOf(snapshot, 950).parent = { repository: FOREIGN_REPOSITORY, number: 12 };
  return snapshot;
}

// The Project field is null, so the foreign parent on the issue contradicts it. annotate keeps the
// parent, and the classifier holds the issue rather than selecting it as a standalone root.
test("select-next holds issue 950 for a foreign parent its Project field lacks", async () => {
  const annotated = annotateSnapshot(unparentedWithForeignParent());
  assert.deepEqual(issueOf(annotated, 950).parent, { repository: FOREIGN_REPOSITORY, number: 12 });
  const result = await selectNext(annotated);
  assert.equal(result.selected, null);
  const group = result.groups.find(({ rootIssueNumber }) => rootIssueNumber === 950);
  assert.equal(group?.kind, "hold");
  assert.ok(group.reasons.includes("cross-repository parent TychoHenzen/DeepSeekCustom#12"));
  assert.ok(group.reasons.includes("contradictory parent for issue #950"));
});

// The Project field carries the foreign parent, so annotate keeps it on the issue too. The classifier
// holds issue 950 under its own root, and no group forms under the foreign parent's number.
test("select-next holds issue 950 for a foreign parent its Project field carries", async () => {
  const snapshot = unparentedWithForeignParent();
  setField(snapshot, 950, "Parent issue", { repository: FOREIGN_REPOSITORY, number: 12 });
  const annotated = annotateSnapshot(snapshot);
  assert.deepEqual(issueOf(annotated, 950).parent, { repository: FOREIGN_REPOSITORY, number: 12 });
  const result = await selectNext(annotated);
  assert.equal(result.selected, null);
  const group = result.groups.find(({ rootIssueNumber }) => rootIssueNumber === 950);
  assert.equal(group?.kind, "hold");
  assert.ok(group.reasons.includes("cross-repository parent TychoHenzen/DeepSeekCustom#12"));
  assert.equal(result.groups.some(({ rootIssueNumber }) => rootIssueNumber === 12), false);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const reviewStart = skill.indexOf("## Independent completion review");
const commitStart = skill.indexOf("## Commit and push");
const review = skill.slice(reviewStart, commitStart);

test("completion review gates implementation commits after initial verification", () => {
  assert.ok(reviewStart > skill.indexOf("## Verify and prepare generated files"));
  assert.ok(commitStart > reviewStart);
  assert.match(review, /invoke one fresh independent\s+reviewer/);
  assert.match(review, /Do not reuse an implementer/);
  assert.match(review, /unavailable or fails,\s+stop before committing or pushing implementation changes/);
  assert.match(review, /initial branch-only push in Start the ticket remains permitted/);
});

test("reviewer gets a self-contained contract and final-state evidence", () => {
  assert.match(review, /parent PBI's full description, implementation notes, and\s+acceptance criteria/);
  assert.match(review, /every linked sub-issue and its pushed evidence when closed/);
  assert.match(review, /all applicable repository instructions/);
  assert.match(review, /final diff against the\s+fetched default-branch base, including staged, unstaged, and new files/);
  assert.match(review, /relevant final files and callers/);
  assert.match(review, /commands, results, and user-path\s+evidence mapped to each criterion/);
  assert.match(review, /State explicitly when there are no sub-issues/);
});

test("adversarial review asks for grounded challenges without mutation authority", () => {
  assert.match(review, /Favor false positives: report concrete requirement or evidence gaps even when/);
  assert.match(review, /give an ID, the requirement, file or evidence/);
  assert.match(review, /Stay read-only/);
  assert.match(review, /Do not edit code, expand the PBI, publish/);
  assert.match(review, /comments, commit, push, approve, mark ready, merge, or close a pull request or/);
});

test("coordinator must substantiate dispositions and re-review repaired gaps", () => {
  assert.match(review, /Independently check every challenge against the PBI contract and final files/);
  assert.match(review, /`resolved`: a valid gap was fixed/);
  assert.match(review, /`invalid`: current files or verification disprove/);
  assert.match(review, /`irrelevant`: the challenge asks for behavior outside the PBI/);
  assert.match(review, /A valid unresolved gap blocks completion, commit, and implementation push/);
  assert.match(review, /fix it, and rerun affected checks/);
  assert.match(review, /repeat independent review with the updated diff, files, verification/);
  assert.match(review, /Any later implementation change invalidates the reviewed state/);
  assert.match(review, /every challenge has an evidenced\s+disposition/);
  assert.match(skill.slice(commitStart), /every challenge's\s+disposition with evidence/);
});

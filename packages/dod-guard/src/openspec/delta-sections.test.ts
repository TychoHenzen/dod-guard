/**
 * The `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` headings that group a
 * spec delta's requirements. Only REMOVED changes what the converter emits:
 * nothing under it can be proved, so it must reach neither a group nor a leaf.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRequirementBlocks } from "./requirements.js";

function requirement(section: string, title: string, scenario: string): string {
  return [
    `## ${section}`,
    "",
    `### Requirement: ${title}`,
    "",
    `#### Scenario: ${scenario}`,
    "- **WHEN** the change lands",
    `- **THEN** ${scenario} holds`,
    "",
  ].join("\n");
}

test("a requirement under REMOVED Requirements produces no block", () => {
  const blocks = extractRequirementBlocks(requirement("REMOVED Requirements", "Old flag", "The flag is gone"));
  assert.deepEqual(blocks, []);
});

test("a requirement under ADDED Requirements still produces a block with its scenarios", () => {
  const blocks = extractRequirementBlocks(requirement("ADDED Requirements", "New flag", "The flag appears"));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "New flag");
  assert.equal(blocks[0].scenarios.length, 1);
  assert.equal(blocks[0].scenarios[0].title, "The flag appears");
  assert.equal(blocks[0].scenarios[0].intent, "The flag appears holds");
});

test("a requirement under MODIFIED Requirements still produces a block", () => {
  const blocks = extractRequirementBlocks(requirement("MODIFIED Requirements", "Changed flag", "The flag differs"));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "Changed flag");
  assert.equal(blocks[0].scenarios.length, 1);
});

test("a requirement under RENAMED Requirements still produces a block", () => {
  const blocks = extractRequirementBlocks(requirement("RENAMED Requirements", "Renamed flag", "The flag is renamed"));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "Renamed flag");
});

test("a delta mixing ADDED, MODIFIED and REMOVED emits only the non-removed requirements", () => {
  const delta = [
    requirement("ADDED Requirements", "Added one", "Added scenario"),
    requirement("MODIFIED Requirements", "Modified one", "Modified scenario"),
    requirement("REMOVED Requirements", "Removed one", "Removed scenario"),
  ].join("\n");

  const titles = extractRequirementBlocks(delta).map((b) => b.title);
  assert.deepEqual(titles, ["Added one", "Modified one"]);
});

test("a REMOVED section does not swallow the requirements of the section after it", () => {
  const delta = [
    requirement("REMOVED Requirements", "Removed one", "Removed scenario"),
    requirement("ADDED Requirements", "Added after", "Added scenario"),
  ].join("\n");

  const blocks = extractRequirementBlocks(delta);
  assert.deepEqual(
    blocks.map((b) => b.title),
    ["Added after"],
  );
  assert.equal(blocks[0].scenarios.length, 1, "the surviving requirement keeps its own scenario");
});

test("a removed requirement's scenarios do not land on the requirement before it", () => {
  const delta = [
    requirement("ADDED Requirements", "Kept one", "Kept scenario"),
    requirement("REMOVED Requirements", "Removed one", "Removed scenario"),
  ].join("\n");

  const blocks = extractRequirementBlocks(delta);
  assert.equal(blocks.length, 1);
  assert.deepEqual(
    blocks[0].scenarios.map((s) => s.title),
    ["Kept scenario"],
  );
});

test("a requirement before any section heading still produces a block", () => {
  // Some deltas carry no `## ... Requirements` heading at all.
  const delta = [
    "### Requirement: Heading-less",
    "",
    "#### Scenario: Still converts",
    "- **WHEN** the delta has no section heading",
    "- **THEN** the requirement still converts",
    "",
  ].join("\n");

  const blocks = extractRequirementBlocks(delta);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "Heading-less");
  assert.equal(blocks[0].scenarios.length, 1);
});

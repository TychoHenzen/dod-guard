import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runJson, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: metadata", () => {
  const fx = useFixtures();

  it("catches bad name format and reserved words", () => {
    const path = fx.write("badname.md", [
      "---",
      "name: Bad_Skill_Name",
      "description: Does things.",
      "---",
      "",
      "# Bad Name",
      "",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    assert.equal(checks.find((c) => c.id === "name-format").pass, false);

    const reserved = fx.write("reserved.md", [
      "---",
      "name: claude-helper",
      "description: Helps with things.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const { checks: rc } = runJson(reserved);
    const nameCheck = rc.find((c) => c.id === "name-format");
    assert.equal(nameCheck.pass, false);
    assert.match(nameCheck.detail, /reserved word/);
  });

  it("catches first-person description", () => {
    const path = fx.write("firstperson.md", [
      "---",
      "name: first-person",
      "description: I help you process files and things.",
      "---",
      "",
      "# First Person",
      "",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    assert.equal(checks.find((c) => c.id === "description-person").pass, false);
  });

  it("flags a description with no when-to-use language", () => {
    const path = fx.write("notrigger.md", [
      "---",
      "name: no-trigger",
      "description: Processes spreadsheets into reports.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    assert.equal(checks.find((c) => c.id === "description-triggers").pass, false);
  });
});

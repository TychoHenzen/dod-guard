import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doc, runJson, useFixtures } from "./migration-check-harness.mjs";

describe("migration-check: kind detection", () => {
  const fx = useFixtures();

  it("detects kind skill from a SKILL.md basename", () => {
    const path = fx.write(
      "SKILL.md",
      doc({ description: "Processes files for deployment. Use when the user asks for a deployment." }),
    );
    const { kind } = runJson(path);
    assert.equal(kind, "skill");
  });

  it("detects kind claude-md from a CLAUDE.md basename", () => {
    const { kind } = runJson(fx.write("CLAUDE.md", ["# Notes", "", "Some project guidance.", ""]));
    assert.equal(kind, "claude-md");
  });

  it("detects kind memory from a MEMORY.md basename", () => {
    const memPath = fx.write("MEMORY.md", ["---", "name: memory-file", "description: Notes.", "---", ""]);
    assert.equal(runJson(memPath).kind, "memory");
  });

  it("detects kind instinct from an INSTINCTS.md basename", () => {
    const instinctsPath = fx.write("INSTINCTS.md", [
      "---",
      "id: instincts",
      "trigger: doing a thing",
      "confidence: 0.8",
      "domain: workflow",
      "---",
      "",
    ]);
    assert.equal(runJson(instinctsPath).kind, "instinct");
  });

  it("detects kind memory from a memory/ path segment", () => {
    const memNotesPath = fx.writeIn("memory", "notes.md", ["---", "name: notes", "description: Notes.", "---", ""]);
    assert.equal(runJson(memNotesPath).kind, "memory");
  });

  it("detects kind instinct from an instincts/ path segment", () => {
    const instinctsNotesPath = fx.writeIn("instincts", "notes.md", [
      "---",
      "id: notes",
      "trigger: doing a thing",
      "confidence: 0.8",
      "domain: workflow",
      "---",
      "",
    ]);
    assert.equal(runJson(instinctsNotesPath).kind, "instinct");
  });

  it("detects kind agent from an agents/ path segment", () => {
    const agentPath = fx.writeIn("agents", "some-agent.md", [
      "---",
      "name: some-agent",
      "description: Handles a task.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const { kind } = runJson(agentPath);
    assert.equal(kind, "agent");
  });

  it("falls back to kind skill for an unrecognized path", () => {
    const path = fx.write(
      "random-file.md",
      doc({ name: "random", description: "Does a thing. Use when the user asks for it." }),
    );
    const { kind } = runJson(path);
    assert.equal(kind, "skill");
  });
});

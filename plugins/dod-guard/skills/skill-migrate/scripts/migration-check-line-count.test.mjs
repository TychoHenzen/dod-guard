import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { run, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: line count", () => {
  const fx = useFixtures();

  const writeWithBodyLength = (name, frontmatterLines, bodyLineCount) => {
    const bodyLines = Array.from({ length: bodyLineCount }, (_, i) => `Body line ${i}`);
    return fx.write(name, [...frontmatterLines, ...bodyLines]);
  };

  it("a 250-line agent file warns and a 450-line agent file fails line-count", () => {
    const frontmatter = ["---", "name: agent-warn", "description: Handles a task.", "tools: Read, Edit", "---"];
    const warnPath = writeWithBodyLength("agent-warn.md", frontmatter, 250);
    const r250 = run([warnPath, "--kind=agent", "--json"]);
    const warnOut = JSON.parse(r250.stdout).checks.find((c) => c.id === "line-count");
    assert.equal(warnOut.pass, true);
    assert.equal(warnOut.warn, true);

    const failPath = writeWithBodyLength("agent-fail.md", frontmatter, 450);
    const r450 = run([failPath, "--kind=agent", "--json"]);
    const failOut = JSON.parse(r450.stdout).checks.find((c) => c.id === "line-count");
    assert.equal(failOut.pass, false);
  });

  it("a 50-line memory file warns and a 150-line memory file fails line-count", () => {
    const frontmatter = [
      "---",
      "name: memory-warn",
      "description: Tracks preferences.",
      "metadata:",
      "  type: user",
      "---",
    ];
    const warnPath = writeWithBodyLength("memory-warn.md", frontmatter, 50);
    const r50 = run([warnPath, "--kind=memory", "--json"]);
    const warnOut = JSON.parse(r50.stdout).checks.find((c) => c.id === "line-count");
    assert.equal(warnOut.pass, true);
    assert.equal(warnOut.warn, true);

    const failPath = writeWithBodyLength("memory-fail.md", frontmatter, 150);
    const r150 = run([failPath, "--kind=memory", "--json"]);
    const failOut = JSON.parse(r150.stdout).checks.find((c) => c.id === "line-count");
    assert.equal(failOut.pass, false);
  });

  it("a 30-line instinct file warns and a 70-line instinct file fails line-count", () => {
    const frontmatter = [
      "---",
      "id: instinct-warn",
      "trigger: doing a thing",
      "confidence: 0.8",
      "domain: workflow",
      "---",
    ];
    const warnPath = writeWithBodyLength("instinct-warn.md", frontmatter, 30);
    const r30 = run([warnPath, "--kind=instinct", "--json"]);
    const warnOut = JSON.parse(r30.stdout).checks.find((c) => c.id === "line-count");
    assert.equal(warnOut.pass, true);
    assert.equal(warnOut.warn, true);

    const failPath = writeWithBodyLength("instinct-fail.md", frontmatter, 70);
    const r70 = run([failPath, "--kind=instinct", "--json"]);
    const failOut = JSON.parse(r70.stdout).checks.find((c) => c.id === "line-count");
    assert.equal(failOut.pass, false);
  });
});

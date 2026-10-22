import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doc, run, useFixtures } from "./migration-check-harness.mjs";

describe("migration-check: agent tools", () => {
  const fx = useFixtures();

  const agentToolsCheck = (file, extra) => {
    const path = fx.write(
      file,
      doc({ name: "agent-z", description: "Does something. Use when asked.", extra, body: ["Scope: one file."] }),
    );
    const r = run([path, "--kind=agent", "--json"]);
    return JSON.parse(r.stdout).checks.find((c) => c.id === "agent-tools");
  };

  it("agent-tools fails when the frontmatter has no tools line", () => {
    const path = fx.write(
      "agent-no-tools.md",
      doc({ name: "agent-x", description: "Does something. Use when asked.", body: ["Scope: one file."] }),
    );
    const r = run([path, "--kind=agent", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "agent-tools");
    assert.equal(out.pass, false);
  });

  it("agent-tools passes when the frontmatter declares tools", () => {
    const path = fx.write(
      "agent-tools.md",
      doc({
        name: "agent-y",
        description: "Does something. Use when asked.",
        extra: ["tools: Read, Edit"],
        body: ["Scope: one file."],
      }),
    );
    const r = run([path, "--kind=agent", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "agent-tools");
    assert.equal(out.pass, true, `Expected pass: ${out.detail}`);
  });

  it("agent-tools passes with no tools line and inheritAllTools true", () => {
    const out = agentToolsCheck("agent-inherit.md", ["inheritAllTools: true"]);
    assert.equal(out.pass, true, out.detail);
  });

  it("agent-tools fails with no tools line and no inherit marker", () => {
    const out = agentToolsCheck("agent-no-marker.md", []);
    assert.equal(out.pass, false, `no marker must fail: ${out.detail}`);
  });

  it("agent-tools fails with no tools line and inheritAllTools false", () => {
    const extra = ["inheritAllTools: false"];
    const out = agentToolsCheck("agent-marker-false.md", extra);
    assert.equal(out.pass, false, `false marker must fail: ${out.detail}`);
  });

  it("agent-tools fails with empty tools and no inherit marker", () => {
    const out = agentToolsCheck("agent-empty-tools.md", ["tools:"]);
    assert.equal(out.pass, false, `empty tools must fail: ${out.detail}`);
  });

  it("agent-tools fails as contradictory with both keys", () => {
    const extra = ["tools: Read, Edit", "inheritAllTools: true"];
    const out = agentToolsCheck("agent-contradiction.md", extra);
    assert.equal(out.pass, false, out.detail);
    assert.match(out.detail, /contradiction/);
  });

  it("agent-tools passes empty tools with inheritAllTools true", () => {
    const extra = ["tools:", "inheritAllTools: true"];
    const out = agentToolsCheck("agent-empty-inherit.md", extra);
    assert.equal(out.pass, true, out.detail);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doc, run, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: memory frontmatter", () => {
  const fx = useFixtures();

  it("memory-frontmatter fails when metadata.type is missing, naming the problem", () => {
    const path = fx.write(
      "mem-no-type.md",
      doc({ name: "mem-check", description: "Tracks preferences.", body: ["Notes."] }),
    );
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "memory-frontmatter");
    assert.equal(out.pass, false);
    assert.match(out.detail, /type/i);
  });

  it("memory-frontmatter fails when metadata.type is outside the allowed set, naming the problem", () => {
    const path = fx.write(
      "mem-bad-type.md",
      doc({
        name: "mem-check",
        description: "Tracks preferences.",
        extra: ["metadata:", "  type: bogus"],
        body: ["Notes."],
      }),
    );
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "memory-frontmatter");
    assert.equal(out.pass, false);
    assert.match(out.detail, /bogus/);
  });

  it("memory-frontmatter passes with name, description, and an allowed metadata.type", () => {
    const path = fx.write(
      "mem-good.md",
      doc({
        name: "mem-check",
        description: "Tracks preferences.",
        extra: ["metadata:", "  type: feedback"],
        body: ["Notes."],
      }),
    );
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "memory-frontmatter");
    assert.equal(out.pass, true, `Expected pass: ${out.detail}`);
  });
});

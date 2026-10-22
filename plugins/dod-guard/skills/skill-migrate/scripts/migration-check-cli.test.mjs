import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BAD_SKILL, doc, GOOD_SKILL, run, runJson, useFixtures } from "./migration-check-harness.mjs";

describe("migration-check: cli", () => {
  const fx = useFixtures();

  it("exits 3 with no arguments", () => {
    const r = run([]);
    assert.equal(r.code, 3);
  });

  it("exits 3 when the file does not exist", () => {
    const r = run([join(fx.dir(), "missing.md")]);
    assert.equal(r.code, 3);
  });

  it("passes a clean minimal skill with a full score", () => {
    const r = run([fx.write("good.md", GOOD_SKILL)]);
    assert.equal(r.code, 0, `Expected pass but got:\n${r.stdout}`);
    assert.match(r.stdout, /5\.0-readiness: 100\/100/);
  });

  it("scores a clean skill above a scaffolding-laden one", () => {
    const clean = runJson(fx.write("good.md", GOOD_SKILL));
    const bad = runJson(fx.write("bad.md", BAD_SKILL));
    assert.ok(clean.score > bad.score, `Expected clean (${clean.score}) > scaffolded (${bad.score})`);
  });

  it("--kind overrides detection", () => {
    const path = fx.write(
      "SKILL.md",
      doc({ description: "Processes files for deployment. Use when the user asks for a deployment." }),
    );
    const r = run([path, "--kind=agent", "--json"]);
    const { kind } = JSON.parse(r.stdout);
    assert.equal(kind, "agent");
  });

  it("exits 3 for an unknown --kind value", () => {
    const path = fx.write("bad-kind.md", ["---", "name: x", "description: y.", "---", ""]);
    const r = run([path, "--kind=bogus"]);
    assert.equal(r.code, 3);
  });

  it("an unchanged SKILL.md scores exactly what it scored before per-kind weighting", () => {
    const r = run([fx.write("good.md", GOOD_SKILL)]);
    assert.match(r.stdout, /5\.0-readiness: 100\/100/);
  });
});

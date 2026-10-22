import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { doc, run, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: compare", () => {
  const fx = useFixtures();

  it("save and compare produces before/after with score delta", () => {
    const beforePath = fx.write(
      "before.md",
      doc({
        name: "evolving",
        description: "I process things for you.",
        body: ["# Evolving", "", "Double-check your work before proceeding.", "Scope: one file."],
      }),
    );
    const afterPath = fx.write(
      "after.md",
      doc({
        name: "evolving",
        description: "Processes things in batch mode. Use when the user asks for a batch run.",
        body: ["# Evolving", "", "Scope: one file."],
      }),
    );
    const savePath = join(fx.dir(), "baseline.json");

    run([beforePath, `--save=${savePath}`]);
    const r = run([afterPath, `--before=${savePath}`, "--json"]);
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.rows.find((row) => row.id === "description-person").status, "FIXED");
    assert.equal(out.rows.find((row) => row.id === "no-scaffolding").status, "FIXED");
    assert.ok(typeof out.before === "number" && typeof out.after === "number");
    assert.ok(out.delta > 0, `Expected positive score delta, got ${out.delta}`);
    assert.equal(out.delta, out.after - out.before);
  });

  it("--save writes the resolved kind as a top-level field", () => {
    const path = fx.write("kind-save.md", doc({ name: "kind-save" }));
    const savePath = join(fx.dir(), "kind-save-baseline.json");
    run([path, `--save=${savePath}`]);
    const saved = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(saved.kind, "skill");
  });
});

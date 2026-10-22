import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { doc, run, useFixtures } from "./migration-check-harness.mjs";

describe("migration-check: baseline kind", () => {
  const fx = useFixtures();

  it("--before against a baseline of the same kind still compares and exits 0 or 1 on regression", () => {
    const beforePath = fx.write("samekind-before.md", doc({ name: "samekind" }));
    const afterPath = fx.write(
      "samekind-after.md",
      doc({ name: "samekind", body: ["# Heading", "", "Never touch other files.", "Scope: one file."] }),
    );
    const savePath = join(fx.dir(), "samekind-baseline.json");
    run([beforePath, `--save=${savePath}`]);
    const r = run([afterPath, `--before=${savePath}`, "--json"]);
    assert.ok(r.code === 0 || r.code === 1, `Expected 0 or 1, got ${r.code}`);
    const out = JSON.parse(r.stdout);
    assert.ok(Array.isArray(out.rows));
    const regressed = out.rows.some((row) => row.status === "REGRESSED");
    assert.equal(r.code, regressed ? 1 : 0);
  });

  it("--before against a baseline of a different kind exits 3 and names both kinds on stderr", () => {
    const skillPath = fx.write("crosskind-skill.md", doc({ name: "crosskind" }));
    const agentPath = fx.write(
      "crosskind-agent.md",
      doc({
        name: "crosskind-agent",
        description: "Does something. Use when asked.",
        extra: ["tools: Read"],
        body: ["Scope: one file."],
      }),
    );
    const savePath = join(fx.dir(), "crosskind-baseline.json");
    run([skillPath, `--save=${savePath}`]);
    const r = run([agentPath, "--kind=agent", `--before=${savePath}`]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /skill/);
    assert.match(r.stderr, /agent/);
    assert.doesNotMatch(r.stdout, /Before \/ After/);
  });

  it("--before against a baseline with no kind field compares as it did before", () => {
    const path = fx.write("legacy.md", doc({ name: "legacy" }));
    const savePath = join(fx.dir(), "legacy-baseline.json");
    run([path, `--save=${savePath}`]);
    const saved = JSON.parse(readFileSync(savePath, "utf8"));
    delete saved.kind;
    writeFileSync(savePath, JSON.stringify(saved));

    const r = run([path, `--before=${savePath}`, "--json"]);
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.ok(Array.isArray(out.rows));
    assert.ok(out.rows.length > 0);
  });
});

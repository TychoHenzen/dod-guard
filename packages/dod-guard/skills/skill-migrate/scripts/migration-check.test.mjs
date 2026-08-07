import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const SCRIPT = new URL("./migration-check.mjs", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function run(args, opts) {
  try {
    const out = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      ...opts,
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("migration-check", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "migration-check-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("exits 3 with no arguments", () => {
    const r = run([]);
    assert.equal(r.code, 3);
  });

  it("passes a clean minimal skill", () => {
    const skill = [
      "---",
      "name: good-skill",
      "description: Processes files for deployment in batch mode.",
      "---",
      "",
      "# Good Skill",
      "",
      "Do the thing. Scope is one file per run.",
      "",
    ].join("\n");
    const path = join(dir, "good.md");
    writeFileSync(path, skill);
    const r = run([path]);
    assert.equal(r.code, 0, `Expected pass but got:\n${r.stdout}`);
  });

  it("catches scaffolding patterns", () => {
    const skill = [
      "---",
      "name: bad-skill",
      "description: Catches problems in code before they ship.",
      "---",
      "",
      "# Bad Skill",
      "",
      "Double-check your work before proceeding.",
      "Verify your output matches the spec.",
      "Confirm you did not miss anything.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "bad.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    assert.equal(r.code, 1);
    const checks = JSON.parse(r.stdout);
    const scaffolding = checks.find((c) => c.id === "no-scaffolding");
    assert.equal(scaffolding.pass, false);
    assert.ok(scaffolding.hits.length >= 3, `Expected 3+ hits, got ${scaffolding.hits.length}`);
  });

  it("catches bad name format", () => {
    const skill = [
      "---",
      "name: Bad_Skill_Name",
      "description: Does things.",
      "---",
      "",
      "# Bad Name",
      "",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "badname.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const nameCheck = checks.find((c) => c.id === "name-format");
    assert.equal(nameCheck.pass, false);
  });

  it("catches first-person description", () => {
    const skill = [
      "---",
      "name: first-person",
      "description: I help you process files and things.",
      "---",
      "",
      "# First Person",
      "",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "firstperson.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const personCheck = checks.find((c) => c.id === "description-person");
    assert.equal(personCheck.pass, false);
  });

  it("skips scaffolding patterns inside code fences", () => {
    const skill = [
      "---",
      "name: fenced-ok",
      "description: Runs scripts that check output.",
      "---",
      "",
      "# Fenced",
      "",
      "Scope: one file.",
      "",
      "```bash",
      "echo 'double-check your work'",
      "```",
      "",
    ].join("\n");
    const path = join(dir, "fenced.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const scaffolding = checks.find((c) => c.id === "no-scaffolding");
    assert.equal(scaffolding.pass, true, `False positive in code fence: ${scaffolding.detail}`);
  });

  it("catches conservative filter patterns", () => {
    const skill = [
      "---",
      "name: conservative",
      "description: Reviews code for issues.",
      "---",
      "",
      "# Conservative",
      "",
      "Be conservative when flagging issues.",
      "Only report high-severity problems.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "conservative.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const cf = checks.find((c) => c.id === "no-conservative-filters");
    assert.equal(cf.pass, false);
    assert.ok(cf.hits.length >= 2, `Expected 2+ hits, got ${cf.hits.length}`);
  });

  it("catches bare negative rules without alternatives", () => {
    const skill = [
      "---",
      "name: bare-neg",
      "description: Checks code quality.",
      "---",
      "",
      "# Bare Negatives",
      "",
      "Never modify files outside the target directory.",
      "Do not add new dependencies.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "bareneg.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const bn = checks.find((c) => c.id === "no-bare-negatives");
    assert.equal(bn.pass, false);
    assert.ok(bn.hits.length >= 2);
  });

  it("passes negative rules that have alternatives", () => {
    const skill = [
      "---",
      "name: good-neg",
      "description: Checks code quality.",
      "---",
      "",
      "# Good Negatives",
      "",
      "Never use console.log. Use src/utils/logger.ts instead.",
      "Do not modify files outside the target. Use a temp directory instead.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "goodneg.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const bn = checks.find((c) => c.id === "no-bare-negatives");
    assert.equal(bn.pass, true, `False positive: ${bn.detail}`);
  });

  it("catches implicit scope instructions", () => {
    const skill = [
      "---",
      "name: implicit",
      "description: Processes files in batch.",
      "---",
      "",
      "# Implicit Scope",
      "",
      "Apply the formatting to the document.",
      "Check the output for errors.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "implicit.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const is = checks.find((c) => c.id === "no-implicit-scope");
    assert.equal(is.pass, false);
    assert.ok(is.hits.length >= 2);
  });

  it("catches drip-fed cross-phase references", () => {
    const skill = [
      "---",
      "name: drip-fed",
      "description: Multi-phase skill for testing.",
      "---",
      "",
      "# Drip Fed",
      "",
      "## Phase 1",
      "",
      "Collect data.",
      "",
      "## Phase 2",
      "",
      "As described in Phase 1, process the data.",
      "See step 1 above for details.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "dripfed.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const df = checks.find((c) => c.id === "no-drip-fed");
    assert.equal(df.pass, false);
    assert.ok(df.hits.length >= 1);
  });

  it("catches redundant repeated instructions", () => {
    const skill = [
      "---",
      "name: redundant",
      "description: Processes files in batch mode.",
      "---",
      "",
      "# Redundant",
      "",
      "Always validate the output before returning results to the user.",
      "",
      "## Later section",
      "",
      "Always validate the output before returning the results to the user.",
      "Scope: one file.",
      "",
    ].join("\n");
    const path = join(dir, "redundant.md");
    writeFileSync(path, skill);
    const r = run([path, "--json"]);
    const checks = JSON.parse(r.stdout);
    const rr = checks.find((c) => c.id === "no-redundant-repetition");
    assert.equal(rr.pass, false, `Expected repeated instruction detected: ${rr.detail}`);
  });

  it("save and compare produces before/after", () => {
    const before = [
      "---",
      "name: evolving",
      "description: I process things for you.",
      "---",
      "",
      "# Evolving",
      "",
      "Double-check your work before proceeding.",
      "Scope: one file.",
      "",
    ].join("\n");
    const afterSkill = [
      "---",
      "name: evolving",
      "description: Processes things in batch mode.",
      "---",
      "",
      "# Evolving",
      "",
      "Scope: one file.",
      "",
    ].join("\n");
    const beforePath = join(dir, "before.md");
    const afterPath = join(dir, "after.md");
    const savePath = join(dir, "baseline.json");
    writeFileSync(beforePath, before);
    writeFileSync(afterPath, afterSkill);

    run([beforePath, `--save=${savePath}`]);
    const r = run([afterPath, `--before=${savePath}`, "--json"]);
    assert.equal(r.code, 0);
    const rows = JSON.parse(r.stdout);
    const personRow = rows.find((r) => r.id === "description-person");
    assert.equal(personRow.status, "FIXED");
    const scaffoldRow = rows.find((r) => r.id === "no-scaffolding");
    assert.equal(scaffoldRow.status, "FIXED");
  });
});

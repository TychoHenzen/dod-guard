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

function runJson(path) {
  const r = run([path, "--json"]);
  return { ...r, ...JSON.parse(r.stdout) };
}

describe("migration-check", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "migration-check-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeSkill(name, lines) {
    const path = join(dir, name);
    writeFileSync(path, lines.join("\n"));
    return path;
  }

  it("exits 3 with no arguments", () => {
    const r = run([]);
    assert.equal(r.code, 3);
  });

  it("exits 3 when the file does not exist", () => {
    const r = run([join(dir, "missing.md")]);
    assert.equal(r.code, 3);
  });

  it("passes a clean minimal skill with a full score", () => {
    const path = writeSkill("good.md", [
      "---",
      "name: good-skill",
      "description: Processes files for deployment in batch mode. Use when the user asks for a batch deployment.",
      "---",
      "",
      "# Good Skill",
      "",
      "Do the thing. Scope is one file per run.",
      "",
    ]);
    const r = run([path]);
    assert.equal(r.code, 0, `Expected pass but got:\n${r.stdout}`);
    assert.match(r.stdout, /5\.0-readiness: 100\/100/);
  });

  it("catches scaffolding patterns and lowers the score", () => {
    const path = writeSkill("bad.md", [
      "---",
      "name: bad-skill",
      "description: Catches problems in code before they ship. Use when the user asks for a scan.",
      "---",
      "",
      "# Bad Skill",
      "",
      "Double-check your work before proceeding.",
      "Verify your output matches the spec.",
      "Confirm you did not miss anything.",
      "Scope: one file.",
      "",
    ]);
    const { code, score, checks } = runJson(path);
    assert.equal(code, 1);
    const scaffolding = checks.find((c) => c.id === "no-scaffolding");
    assert.equal(scaffolding.pass, false);
    assert.ok(scaffolding.hits.length >= 3, `Expected 3+ hits, got ${scaffolding.hits.length}`);
    assert.ok(scaffolding.score < 1, "count check should score below 1");
    assert.ok(score < 100, `Expected score below 100, got ${score}`);
  });

  it("catches bad name format and reserved words", () => {
    const path = writeSkill("badname.md", [
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

    const reserved = writeSkill("reserved.md", [
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
    const path = writeSkill("firstperson.md", [
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
    const path = writeSkill("notrigger.md", [
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

  it("skips scaffolding patterns inside code fences", () => {
    const path = writeSkill("fenced.md", [
      "---",
      "name: fenced-ok",
      "description: Runs scripts that check output. Use when the user asks for a check.",
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
    ]);
    const { checks } = runJson(path);
    const scaffolding = checks.find((c) => c.id === "no-scaffolding");
    assert.equal(scaffolding.pass, true, `False positive in code fence: ${scaffolding.detail}`);
  });

  it("catches conservative filter patterns", () => {
    const path = writeSkill("conservative.md", [
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
    ]);
    const { checks } = runJson(path);
    const cf = checks.find((c) => c.id === "no-conservative-filters");
    assert.equal(cf.pass, false);
    assert.ok(cf.hits.length >= 2, `Expected 2+ hits, got ${cf.hits.length}`);
  });

  it("catches bare negative rules without alternatives", () => {
    const path = writeSkill("bareneg.md", [
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
    ]);
    const { checks } = runJson(path);
    const bn = checks.find((c) => c.id === "no-bare-negatives");
    assert.equal(bn.pass, false);
    assert.ok(bn.hits.length >= 2);
  });

  it("passes negative rules that have alternatives", () => {
    const path = writeSkill("goodneg.md", [
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
    ]);
    const { checks } = runJson(path);
    const bn = checks.find((c) => c.id === "no-bare-negatives");
    assert.equal(bn.pass, true, `False positive: ${bn.detail}`);
  });

  it("does not treat a prohibition as contradicting itself", () => {
    const path = writeSkill("selfneg.md", [
      "---",
      "name: self-neg",
      "description: Rewrites files from a contract.",
      "---",
      "",
      "# Self Negative",
      "",
      "The tool must not delete files. Use the trash instead.",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    const nc = checks.find((c) => c.id === "no-contradictions");
    assert.equal(nc.pass, true, `Self-contradiction false positive: ${nc.detail}`);
  });

  it("catches a real must/must-not contradiction", () => {
    const path = writeSkill("contra.md", [
      "---",
      "name: contra",
      "description: Validates build output.",
      "---",
      "",
      "# Contradiction",
      "",
      "Always validate the output.",
      "",
      "## Later",
      "",
      "Never validate the output. Use spot checks instead.",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    const nc = checks.find((c) => c.id === "no-contradictions");
    assert.equal(nc.pass, false, `Expected contradiction detected: ${nc.detail}`);
    assert.ok(nc.value >= 1);
  });

  it("catches implicit scope instructions", () => {
    const path = writeSkill("implicit.md", [
      "---",
      "name: implicit",
      "description: Processes files in batch.",
      "---",
      "",
      "# Implicit Scope",
      "",
      "Apply the formatting to the document.",
      "Process the output for errors.",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    const is = checks.find((c) => c.id === "no-implicit-scope");
    assert.equal(is.pass, false);
    assert.ok(is.hits.length >= 2);
  });

  it("catches drip-fed cross-phase references", () => {
    const path = writeSkill("dripfed.md", [
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
    ]);
    const { checks } = runJson(path);
    const df = checks.find((c) => c.id === "no-drip-fed");
    assert.equal(df.pass, false);
    assert.ok(df.hits.length >= 1);
  });

  it("catches time-sensitive references", () => {
    const path = writeSkill("dated.md", [
      "---",
      "name: dated",
      "description: Calls the service API.",
      "---",
      "",
      "# Dated",
      "",
      "Before August 2025, use the v1 endpoint.",
      "Since 2024, the API returns JSON.",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    const ts = checks.find((c) => c.id === "no-time-sensitive");
    assert.equal(ts.pass, false);
    assert.ok(ts.hits.length >= 2, `Expected 2+ hits, got ${ts.hits.length}`);
  });

  it("counts caps-emphasis markers", () => {
    const path = writeSkill("emphasis.md", [
      "---",
      "name: emphasis",
      "description: Formats commit messages.",
      "---",
      "",
      "# Emphasis",
      "",
      "IMPORTANT: run the linter.",
      "IMPORTANT: run the tests.",
      "YOU MUST commit after each step.",
      "ALWAYS push at the end.",
      "Scope: one file.",
      "",
    ]);
    const { checks } = runJson(path);
    const em = checks.find((c) => c.id === "emphasis-density");
    assert.equal(em.pass, false);
    assert.equal(em.value, 4);
  });

  it("catches redundant repeated instructions", () => {
    const path = writeSkill("redundant.md", [
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
    ]);
    const { checks } = runJson(path);
    const rr = checks.find((c) => c.id === "no-redundant-repetition");
    assert.equal(rr.pass, false, `Expected repeated instruction detected: ${rr.detail}`);
  });

  it("scores a clean skill above a scaffolding-laden one", () => {
    const clean = runJson(join(dir, "good.md"));
    const bad = runJson(join(dir, "bad.md"));
    assert.ok(
      clean.score > bad.score,
      `Expected clean (${clean.score}) > scaffolded (${bad.score})`,
    );
  });

  it("save and compare produces before/after with score delta", () => {
    const beforePath = writeSkill("before.md", [
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
    ]);
    const afterPath = writeSkill("after.md", [
      "---",
      "name: evolving",
      "description: Processes things in batch mode. Use when the user asks for a batch run.",
      "---",
      "",
      "# Evolving",
      "",
      "Scope: one file.",
      "",
    ]);
    const savePath = join(dir, "baseline.json");

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
});

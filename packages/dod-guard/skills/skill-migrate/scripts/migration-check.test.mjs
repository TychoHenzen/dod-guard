import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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

  it("detects kind skill from a SKILL.md basename", () => {
    const path = writeSkill("SKILL.md", [
      "---",
      "name: good-skill",
      "description: Processes files for deployment. Use when the user asks for a deployment.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const { kind } = runJson(path);
    assert.equal(kind, "skill");
  });

  it("detects kind claude-md from a CLAUDE.md basename", () => {
    const path = writeSkill("CLAUDE.md", ["# Notes", "", "Some project guidance.", ""]);
    const { kind } = runJson(path);
    assert.equal(kind, "claude-md");
  });

  it("detects kind memory from a MEMORY.md basename", () => {
    const memPath = writeSkill("MEMORY.md", ["---", "name: memory-file", "description: Notes.", "---", ""]);
    assert.equal(runJson(memPath).kind, "memory");
  });

  it("detects kind instinct from an INSTINCTS.md basename", () => {
    const instinctsPath = writeSkill("INSTINCTS.md", [
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
    const memDir = join(dir, "memory");
    mkdirSync(memDir, { recursive: true });
    const memNotesPath = join(memDir, "notes.md");
    writeFileSync(memNotesPath, ["---", "name: notes", "description: Notes.", "---", ""].join("\n"));
    assert.equal(runJson(memNotesPath).kind, "memory");
  });

  it("detects kind instinct from an instincts/ path segment", () => {
    const instinctsDir = join(dir, "instincts");
    mkdirSync(instinctsDir, { recursive: true });
    const instinctsNotesPath = join(instinctsDir, "notes.md");
    writeFileSync(
      instinctsNotesPath,
      ["---", "id: notes", "trigger: doing a thing", "confidence: 0.8", "domain: workflow", "---", ""].join("\n"),
    );
    assert.equal(runJson(instinctsNotesPath).kind, "instinct");
  });

  it("detects kind agent from an agents/ path segment", () => {
    const agentsDir = join(dir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    const agentPath = join(agentsDir, "some-agent.md");
    writeFileSync(
      agentPath,
      ["---", "name: some-agent", "description: Handles a task.", "---", "", "Scope: one file.", ""].join("\n"),
    );
    const { kind } = runJson(agentPath);
    assert.equal(kind, "agent");
  });

  it("falls back to kind skill for an unrecognized path", () => {
    const path = writeSkill("random-file.md", [
      "---",
      "name: random",
      "description: Does a thing. Use when the user asks for it.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const { kind } = runJson(path);
    assert.equal(kind, "skill");
  });

  it("--kind overrides detection", () => {
    const path = writeSkill("SKILL.md", [
      "---",
      "name: good-skill",
      "description: Processes files for deployment. Use when the user asks for a deployment.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const r = run([path, "--kind=agent", "--json"]);
    const { kind } = JSON.parse(r.stdout);
    assert.equal(kind, "agent");
  });

  it("exits 3 for an unknown --kind value", () => {
    const path = writeSkill("bad-kind.md", ["---", "name: x", "description: y.", "---", ""]);
    const r = run([path, "--kind=bogus"]);
    assert.equal(r.code, 3);
  });

  it("agent kind drops delegation-cap and its weight redistributes to the rest", () => {
    const path = writeSkill("agent-file.md", [
      "---",
      "name: agent-check",
      "description: Handles a task. Use when asked.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const r = run([path, "--kind=agent", "--json"]);
    const out = JSON.parse(r.stdout);
    assert.equal(
      out.checks.find((c) => c.id === "delegation-cap"),
      undefined,
    );
    const total = out.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `Expected weights to sum to 100, got ${total}`);
  });

  it("claude-md kind drops frontmatter checks, description-triggers, and delegation-cap", () => {
    const path = writeSkill("notes.md", ["# Notes", "", "Some project guidance.", ""]);
    const r = run([path, "--kind=claude-md", "--json"]);
    const out = JSON.parse(r.stdout);
    for (const id of [
      "name-format",
      "description-present",
      "description-person",
      "description-triggers",
      "delegation-cap",
    ]) {
      assert.equal(
        out.checks.find((c) => c.id === id),
        undefined,
        `Expected ${id} to be excluded from claude-md checks`,
      );
    }
    const total = out.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `Expected weights to sum to 100, got ${total}`);
    assert.equal(typeof out.score, "number");
  });

  it("memory kind drops description-triggers and delegation-cap but keeps other frontmatter checks", () => {
    const path = writeSkill("mem.md", [
      "---",
      "name: mem-check",
      "description: Tracks preferences.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout);
    for (const id of ["description-triggers", "delegation-cap"]) {
      assert.equal(
        out.checks.find((c) => c.id === id),
        undefined,
        `Expected ${id} to be excluded from memory checks`,
      );
    }
    for (const id of ["name-format", "description-present", "description-person"]) {
      assert.ok(out.checks.find((c) => c.id === id), `Expected ${id} to remain in memory checks`);
    }
    const total = out.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `Expected weights to sum to 100, got ${total}`);
  });

  it("skill kind runs all 19 checks with weights summing to 100", () => {
    const r = run([join(dir, "good.md"), "--json"]);
    const out = JSON.parse(r.stdout);
    assert.equal(out.checks.length, 19);
    const total = out.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `Expected weights to sum to 100, got ${total}`);
  });

  it("an unchanged SKILL.md scores exactly what it scored before per-kind weighting", () => {
    const r = run([join(dir, "good.md")]);
    assert.match(r.stdout, /5\.0-readiness: 100\/100/);
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

  function writeWithBodyLength(name, frontmatterLines, bodyLineCount) {
    const bodyLines = Array.from({ length: bodyLineCount }, (_, i) => `Body line ${i}`);
    return writeSkill(name, [...frontmatterLines, ...bodyLines]);
  }

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

  it("memory-frontmatter fails when metadata.type is missing, naming the problem", () => {
    const path = writeSkill("mem-no-type.md", [
      "---",
      "name: mem-check",
      "description: Tracks preferences.",
      "---",
      "",
      "Notes.",
      "",
    ]);
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "memory-frontmatter");
    assert.equal(out.pass, false);
    assert.match(out.detail, /type/i);
  });

  it("memory-frontmatter fails when metadata.type is outside the allowed set, naming the problem", () => {
    const path = writeSkill("mem-bad-type.md", [
      "---",
      "name: mem-check",
      "description: Tracks preferences.",
      "metadata:",
      "  type: bogus",
      "---",
      "",
      "Notes.",
      "",
    ]);
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "memory-frontmatter");
    assert.equal(out.pass, false);
    assert.match(out.detail, /bogus/);
  });

  it("memory-frontmatter passes with name, description, and an allowed metadata.type", () => {
    const path = writeSkill("mem-good.md", [
      "---",
      "name: mem-check",
      "description: Tracks preferences.",
      "metadata:",
      "  type: feedback",
      "---",
      "",
      "Notes.",
      "",
    ]);
    const r = run([path, "--kind=memory", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "memory-frontmatter");
    assert.equal(out.pass, true, `Expected pass: ${out.detail}`);
  });

  it("agent-tools fails when the frontmatter has no tools line", () => {
    const path = writeSkill("agent-no-tools.md", [
      "---",
      "name: agent-x",
      "description: Does something. Use when asked.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const r = run([path, "--kind=agent", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "agent-tools");
    assert.equal(out.pass, false);
  });

  it("agent-tools passes when the frontmatter declares tools", () => {
    const path = writeSkill("agent-tools.md", [
      "---",
      "name: agent-y",
      "description: Does something. Use when asked.",
      "tools: Read, Edit",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const r = run([path, "--kind=agent", "--json"]);
    const out = JSON.parse(r.stdout).checks.find((c) => c.id === "agent-tools");
    assert.equal(out.pass, true, `Expected pass: ${out.detail}`);
  });

  it("a skill-kind run reports neither memory-frontmatter nor agent-tools", () => {
    const { checks } = runJson(join(dir, "good.md"));
    assert.equal(checks.find((c) => c.id === "memory-frontmatter"), undefined);
    assert.equal(checks.find((c) => c.id === "agent-tools"), undefined);
  });

  it("agent and memory kind weights still sum to 100 with their extra check included", () => {
    const agentPath = writeSkill("agent-weights.md", [
      "---",
      "name: agent-w",
      "description: Does something. Use when asked.",
      "tools: Read",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const agentOut = JSON.parse(run([agentPath, "--kind=agent", "--json"]).stdout);
    assert.ok(agentOut.checks.find((c) => c.id === "agent-tools"));
    const agentTotal = agentOut.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(agentTotal - 100) < 0.01, `Expected 100, got ${agentTotal}`);

    const memoryPath = writeSkill("memory-weights.md", [
      "---",
      "name: memory-w",
      "description: Tracks preferences.",
      "metadata:",
      "  type: reference",
      "---",
      "",
      "Notes.",
      "",
    ]);
    const memoryOut = JSON.parse(run([memoryPath, "--kind=memory", "--json"]).stdout);
    assert.ok(memoryOut.checks.find((c) => c.id === "memory-frontmatter"));
    const memoryTotal = memoryOut.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(memoryTotal - 100) < 0.01, `Expected 100, got ${memoryTotal}`);
  });

  function writeInstinct(name, overrides = {}) {
    const fm = {
      id: "shell-dialect-separation",
      trigger: "running shell commands, especially with nested quotes",
      confidence: "0.8",
      domain: "workflow",
      scope: "global",
      evidence: "10+ occurrences across many sessions",
      last_seen: "2026-07-05",
      ...overrides,
    };
    const lines = ["---"];
    for (const [key, val] of Object.entries(fm)) {
      if (val !== undefined) lines.push(`${key}: ${val}`);
    }
    lines.push("---", "", "Three separate shell dialects exist on this machine...", "");
    return writeSkill(name, lines);
  }

  it("an instinct kind run reports none of the memory/skill frontmatter checks", () => {
    const path = writeInstinct("instinct-good.md");
    const out = JSON.parse(run([path, "--kind=instinct", "--json"]).stdout);
    for (const id of [
      "name-format",
      "description-present",
      "description-person",
      "description-triggers",
      "delegation-cap",
      "memory-frontmatter",
      "agent-tools",
    ]) {
      assert.equal(
        out.checks.find((c) => c.id === id),
        undefined,
        `Expected ${id} to be excluded from instinct checks`,
      );
    }
    const instinctCheck = out.checks.find((c) => c.id === "instinct-frontmatter");
    assert.ok(instinctCheck, "Expected instinct-frontmatter check to run");
    assert.equal(instinctCheck.pass, true, `Expected pass: ${instinctCheck.detail}`);
  });

  it("instinct-frontmatter fails on a bad or absent confidence, naming confidence", () => {
    const tooHigh = writeInstinct("instinct-conf-high.md", { confidence: "1.5" });
    const outHigh = JSON.parse(run([tooHigh, "--kind=instinct", "--json"]).stdout);
    const checkHigh = outHigh.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkHigh.pass, false);
    assert.match(checkHigh.detail, /confidence/i);

    const notNumber = writeInstinct("instinct-conf-nan.md", { confidence: "abc" });
    const outNan = JSON.parse(run([notNumber, "--kind=instinct", "--json"]).stdout);
    const checkNan = outNan.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkNan.pass, false);
    assert.match(checkNan.detail, /confidence/i);

    const absent = writeInstinct("instinct-conf-absent.md", { confidence: undefined });
    const outAbsent = JSON.parse(run([absent, "--kind=instinct", "--json"]).stdout);
    const checkAbsent = outAbsent.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkAbsent.pass, false);
    assert.match(checkAbsent.detail, /confidence/i);
  });

  it("instinct-frontmatter fails on a missing id, trigger, or domain, naming the field", () => {
    const noId = writeInstinct("instinct-no-id.md", { id: undefined });
    const outId = JSON.parse(run([noId, "--kind=instinct", "--json"]).stdout);
    const checkId = outId.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkId.pass, false);
    assert.match(checkId.detail, /id/i);

    const noTrigger = writeInstinct("instinct-no-trigger.md", { trigger: undefined });
    const outTrigger = JSON.parse(run([noTrigger, "--kind=instinct", "--json"]).stdout);
    const checkTrigger = outTrigger.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkTrigger.pass, false);
    assert.match(checkTrigger.detail, /trigger/i);

    const noDomain = writeInstinct("instinct-no-domain.md", { domain: undefined });
    const outDomain = JSON.parse(run([noDomain, "--kind=instinct", "--json"]).stdout);
    const checkDomain = outDomain.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkDomain.pass, false);
    assert.match(checkDomain.detail, /domain/i);
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

  it("instinct kind weights sum to 100 with instinct-frontmatter included", () => {
    const path = writeInstinct("instinct-weights.md");
    const out = JSON.parse(run([path, "--kind=instinct", "--json"]).stdout);
    assert.ok(out.checks.find((c) => c.id === "instinct-frontmatter"));
    const total = out.checks.reduce((sum, c) => sum + c.weight, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `Expected 100, got ${total}`);
  });

  it("--save writes the resolved kind as a top-level field", () => {
    const path = writeSkill("kind-save.md", [
      "---",
      "name: kind-save",
      "description: Processes files. Use when the user asks for it.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const savePath = join(dir, "kind-save-baseline.json");
    run([path, `--save=${savePath}`]);
    const saved = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(saved.kind, "skill");
  });

  it("--before against a baseline of the same kind still compares and exits 0 or 1 on regression", () => {
    const beforePath = writeSkill("samekind-before.md", [
      "---",
      "name: samekind",
      "description: Processes files. Use when the user asks for it.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const afterPath = writeSkill("samekind-after.md", [
      "---",
      "name: samekind",
      "description: Processes files. Use when the user asks for it.",
      "---",
      "",
      "# Heading",
      "",
      "Never touch other files.",
      "Scope: one file.",
      "",
    ]);
    const savePath = join(dir, "samekind-baseline.json");
    run([beforePath, `--save=${savePath}`]);
    const r = run([afterPath, `--before=${savePath}`, "--json"]);
    assert.ok(r.code === 0 || r.code === 1, `Expected 0 or 1, got ${r.code}`);
    const out = JSON.parse(r.stdout);
    assert.ok(Array.isArray(out.rows));
    const regressed = out.rows.some((row) => row.status === "REGRESSED");
    assert.equal(r.code, regressed ? 1 : 0);
  });

  it("--before against a baseline of a different kind exits 3 and names both kinds on stderr", () => {
    const skillPath = writeSkill("crosskind-skill.md", [
      "---",
      "name: crosskind",
      "description: Processes files. Use when the user asks for it.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const agentPath = writeSkill("crosskind-agent.md", [
      "---",
      "name: crosskind-agent",
      "description: Does something. Use when asked.",
      "tools: Read",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const savePath = join(dir, "crosskind-baseline.json");
    run([skillPath, `--save=${savePath}`]);
    const r = run([agentPath, "--kind=agent", `--before=${savePath}`]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /skill/);
    assert.match(r.stderr, /agent/);
    assert.doesNotMatch(r.stdout, /Before \/ After/);
  });

  it("--before against a baseline with no kind field compares as it did before", () => {
    const path = writeSkill("legacy.md", [
      "---",
      "name: legacy",
      "description: Processes files. Use when the user asks for it.",
      "---",
      "",
      "Scope: one file.",
      "",
    ]);
    const savePath = join(dir, "legacy-baseline.json");
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

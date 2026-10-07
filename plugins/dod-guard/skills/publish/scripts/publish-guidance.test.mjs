import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skillPath = new URL("../SKILL.md", import.meta.url);
const usagePath = new URL("../../../USAGE.md", import.meta.url);

test("publish guidance exposes the exact cross-client refresh sequence", async () => {
  const documents = await Promise.all([readFile(skillPath, "utf8"), readFile(usagePath, "utf8")]);

  for (const document of documents) {
    assert.match(document, /Claude Code: \/plugin marketplace update dod-guard, then \/reload-plugins/);
    assert.match(document, /Codex: codex plugin marketplace upgrade dod-guard-monorepo/);
    assert.match(document, /Codex: codex plugin add dod-guard@dod-guard-monorepo/);
    assert.match(document, /release-verification\.ps1/);
    assert.doesNotMatch(document, /Claude Code: \/plugin update(?:,| and)/);
  }
});

test("publish guidance restarts only the shared host after cache refresh", async () => {
  const document = await readFile(skillPath, "utf8");
  const codexRefresh = document.indexOf("codex plugin add dod-guard@dod-guard-monorepo");
  const hostRestart = document.indexOf("pm2 restart dod-guard-quality-guard dod-guard-knowledge-base --update-env");
  assert.ok(codexRefresh >= 0);
  assert.ok(hostRestart > codexRefresh);
  assert.match(document, /restart only its two named apps/);
  assert.doesNotMatch(document, /pm2 restart all/);
});

test("publish guidance requires the authenticated Windows PowerShell boundary", async () => {
  const [skill, usage] = await Promise.all([readFile(skillPath, "utf8"), readFile(usagePath, "utf8")]);

  for (const document of [skill, usage]) {
    assert.match(document, /authenticated interactive\s+PowerShell session that launched/);
    assert.match(
      document,
      /gh auth status[\s\S]+\$githubAuthStatus = \$LASTEXITCODE[\s\S]+if \(\$githubAuthStatus -ne 0\)/,
    );
    assert.match(document, /stop before (?:release mutations|protection changes)/);
    assert.match(document, /maintenance-publish\.ps1[\s\S]+release-verification\.ps1/);
    assert.match(document, /preflight-installation\.mjs[\s`]*only parses local client inventory/);
    assert.match(document, /Do not invoke\s+`gh api`(?: from| through) a Node REPL/);
    assert.match(document, /Never copy or persist\s+credentials/);
  }
});

test("publish validates all source versions before release mutations", async () => {
  const [skill, usage] = await Promise.all([readFile(skillPath, "utf8"), readFile(usagePath, "utf8")]);

  const preflightStart = skill.indexOf("## Source metadata preflight");
  const procedureStart = skill.indexOf("## Procedure");
  assert.ok(preflightStart >= 0 && procedureStart > preflightStart);
  const preflight = skill.slice(preflightStart, procedureStart);
  assert.match(preflight, /node scripts\/ci\/validate-plugins\.mjs/);
  assert.match(preflight, /package, Claude, Codex, and\s+present adapter version metadata/);
  assert.match(preflight, /valid `x\.y\.z`\s+version/);
  assert.match(preflight, /mismatch, missing or malformed\s+version, or ambiguous source/);
  assert.match(preflight, /each affected path and observed value/);
  assert.match(preflight, /Correct the tracked metadata explicitly and rerun/);
  assert.match(preflight, /never synchronizes or rewrites manifests/);

  assert.ok(skill.indexOf("git switch --detach", procedureStart) > preflightStart);
  assert.ok(skill.indexOf("Invoke-MaintenancePublish", procedureStart) > preflightStart);
  assert.match(usage, /node scripts\/ci\/validate-plugins\.mjs/);
  assert.match(usage, /Correct the tracked metadata and\s+rerun/);
  assert.match(usage, /never synchronizes manifests/);
});

test("publish skill classifies the complete tree before PBI routing", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /Classify the complete pending tree before requiring a PBI or pull request/);
  assert.match(skill, /If any file is functional,\s+use the functional path for the whole release/);
  assert.match(skill, /For a `maintenance-only` release/);
  assert.match(skill, /For a `functional` release, invoke `\/submit-draft-pr`/);
});

test("publish scans pending content before commit", async () => {
  const skill = await readFile(skillPath, "utf8");
  const scan = skill.indexOf("inspect-repository.mjs");
  const commit = skill.indexOf("Use the checked-in `<skill-dir>/scripts/maintenance-publish.ps1` helper");

  assert.ok(scan >= 0 && scan < commit);
  assert.match(skill, /Stop when `credentialFindings` is non-empty/);
  assert.match(skill, /Never print matched values/);
});

test("publish resolves the exact active installation before release work", async () => {
  const [skill, usage] = await Promise.all([readFile(skillPath, "utf8"), readFile(usagePath, "utf8")]);
  const preflightStart = skill.indexOf("## Installation identity preflight");
  const procedureStart = skill.indexOf("## Procedure");
  const preflight = skill.slice(preflightStart, procedureStart);

  assert.ok(preflightStart >= 0 && procedureStart > preflightStart);
  assert.doesNotMatch(preflight, /(?:codex|claude) plugin list --json\s*\|/);
  assert.match(preflight, /\$inventory = & \$client plugin list --json/);
  assert.match(preflight, /\$clientStatus = \$LASTEXITCODE/);
  assert.match(preflight, /inventory=\$\("\$client" plugin list --json\)/);
  assert.match(preflight, /client_status=\$\?/);
  assert.match(preflight, /before passing\s+captured JSON to Node/);
  assert.match(preflight, /preflight-installation\.mjs/);
  assert.match(preflight, /unique enabled `dod-guard@dod-guard-monorepo` record/);
  assert.match(preflight, /unique enabled `dod-guard@dod-guard` record/);
  assert.match(preflight, /source\.path/);
  assert.match(preflight, /installPath/);
  assert.match(preflight, /\.codex-plugin\/plugin\.json/);
  assert.match(preflight, /\.claude-plugin\/plugin\.json/);
  assert.match(preflight, /absolute path to `skills\/publish\/SKILL\.md`/);
  assert.match(preflight, /If the helper exits non-zero[\s\S]+then stop/);
  assert.match(preflight, /use the\s+returned `pluginRoot` for every later `<plugin-root>` path/);
  assert.ok(usage.includes("Use the installed `/dod-guard:publish` entry point"));
  assert.ok(usage.includes("version=<exact-version>"));
  assert.ok(usage.includes("path=<absolute-path-to-skills/publish/SKILL.md>"));
});

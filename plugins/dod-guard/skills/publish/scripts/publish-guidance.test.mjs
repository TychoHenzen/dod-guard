import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const skillPath = new URL("../SKILL.md", import.meta.url);
const usagePath = new URL("../../../USAGE.md", import.meta.url);
const maintenanceWrapperPath = fileURLToPath(new URL("./maintenance-publish.ps1", import.meta.url));

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

test("maintenance releases skip PBI and PR while restoring protection", async () => {
  const skill = await readFile(skillPath, "utf8");
  const defaults = await readFile(new URL("../../../standards/working-defaults.md", import.meta.url), "utf8");
  const usage = await readFile(usagePath, "utf8");

  assert.match(
    skill,
    /paired version-only bump made solely to invalidate the cache for\s+maintenance content remains `maintenance-only`/,
  );
  assert.match(
    skill,
    /For a `maintenance-only` release:[\s\S]+Do not require or create a PBI, feature branch, or pull request/,
  );
  assert.match(skill, /release commit's parent\s+to equal the saved SHA/);
  assert.match(skill, /`allow_force_pushes\.enabled` to be true/);
  assert.match(skill, /--force-with-lease=refs\/heads\/master:<saved-sha>/);
  assert.match(skill, /lease rejects any intervening update/);
  assert.match(skill, /Never use an\s+unpinned force push/);
  assert.match(skill, /Require both initial reads to return HTTP\s+`200` with non-empty objects/);
  assert.match(
    skill,
    /If the\s+saved `enforce_admins\.enabled` is true, the helper invokes only the\s+validated admin endpoint with/,
  );
  assert.match(skill, /admin_endpoint= repos\/\{owner\}\/\{repo\}\/branches\/master\/protection\/enforce_admins/);
  assert.match(skill, /does not\s+parse the deliberately empty body as\s+JSON/);
  assert.match(
    skill,
    /reads the admin endpoint and complete protection object back even\s+when the command errors or returns an unexpected status; HTTP `200`,\s+`enabled=false`/,
  );
  assert.match(skill, /A force-push\s+allowance alone does not bypass the PR or check rules/);
  assert.match(skill, /It marks restoration required before invoking DELETE/);
  assert.match(
    skill,
    /every exit after an\s+attempted DELETE, including commit, push, or pre-push validation failure,\s+restores the saved admin state/,
  );
  assert.match(skill, /The helper owns the cleanup `finally` scope[\s\S]+restores the saved admin state/);
  assert.match(skill, /gh api --method POST <admin_endpoint>\s+--include/);
  assert.match(skill, /requires HTTP `200`/);
  assert.match(skill, /reads the admin endpoint and\s+complete protection object back after every POST attempt/);
  assert.match(skill, /retries that exact POST once and reads both resources again/);
  assert.match(skill, /If either\s+read throws,\s+it stops without a second POST/);
  assert.match(skill, /Other users\s+remain subject to the branch rules/);
  assert.match(skill, /`-CommitAction` script block that stages only the classified release paths/);
  assert.match(skill, /`-PrePushAction` script block that reruns the\s+release gates/);
  assert.match(skill, /It never invokes a Git worktree\s+command/);
  assert.doesNotMatch(skill, /If branch protection requires a pull request, stop/);
  assert.match(
    defaults,
    /The explicit `\/publish` maintenance-only route may[\s\S]+temporarily disable only admin enforcement/,
  );
  assert.match(skill, /After a direct maintenance push or a merged functional release has green CI/);
  assert.match(
    usage,
    /A successful maintenance result reports the published SHA, the lease SHA, full\s+protection restoration equality, the restore retry count, required-check status,\s+and client-refresh status/,
  );
  assert.match(usage, /Missing cleanup or any required evidence is a\s+failure, not a successful release/);
});

test("maintenance releases classify pending paths before a primary-checkout transition", async () => {
  const [skill, defaults, usage] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(new URL("../../../standards/working-defaults.md", import.meta.url), "utf8"),
    readFile(usagePath, "utf8"),
  ]);
  const inspectStart = skill.indexOf("1. Inspect");
  const inspectEnd = skill.indexOf("2. Before committing", inspectStart);
  const maintenanceStart = skill.indexOf("7. For a `maintenance-only` release:");
  const functionalStart = skill.indexOf("8. For a `functional` release", maintenanceStart);
  const inspection = skill.slice(inspectStart, inspectEnd);
  const maintenance = skill.slice(maintenanceStart, functionalStart);

  assert.ok(inspectStart >= 0 && inspectEnd > inspectStart);
  assert.ok(maintenanceStart >= 0 && functionalStart > maintenanceStart);
  assert.match(inspection, /git status --short --branch --untracked-files=all/);
  assert.match(
    inspection,
    /Classify every staged, unstaged, tracked,\s+and untracked path before branch or ref movement/,
  );
  assert.match(
    inspection,
    /If any path is\s+credential-like, destructive, unrelated, or indistinguishable, report the\s+exact paths and stop before changing the checkout or refs/,
  );
  assert.match(
    maintenance,
    /Confirm the checkout is primary by resolving[\s\S]+git rev-parse --path-format=absolute --git-dir[\s\S]+git rev-parse --path-format=absolute --git-common-dir/,
  );
  assert.match(maintenance, /Use\s+`git switch --detach <saved-sha>` in this same checkout/);
  assert.match(maintenance, /Continue only if\s+Git retains every classified release path without conflict/);
  assert.match(
    maintenance,
    /starting branch reference is\s+unchanged, then rerun the repository inspector and release gates against\s+this exact base/,
  );
  assert.match(maintenance, /Stage only the classified release\s+paths; never use blanket staging/);
  assert.match(maintenance, /release commit's parent to equal the saved SHA/);
  assert.doesNotMatch(maintenance, /separate worktree|create that worktree|git worktree\b/);
  assert.match(
    defaults,
    /maintenance-only `\/publish` route stays in the existing primary checkout\s+and never runs a Git worktree command/,
  );
  assert.doesNotMatch(defaults, /exact-`origin\/master` worktree/);
  assert.match(
    usage,
    /Maintenance publishing stays in the existing primary checkout and does not\s+run Git worktree commands/,
  );
});

test("maintenance checkout failures preserve the starting state and release checkpoint", async () => {
  const skill = await readFile(skillPath, "utf8");
  const start = skill.indexOf("7. For a `maintenance-only` release:");
  const end = skill.indexOf("8. For a `functional` release", start);
  const maintenance = skill.slice(start, end);

  assert.match(
    maintenance,
    /If either value is unavailable\s+or the paths differ, stop before any branch\/ref, release, protection, or\s+cache mutation/,
  );
  assert.match(maintenance, /if it refuses\s+the switch, verify and report the unchanged starting state, then stop/);
  assert.match(maintenance, /If master advances, restore protection, stop[\s\S]+preserve the exact release checkpoint/);
  assert.match(maintenance, /Never create another checkout, stash, or reset to carry release paths/);
  assert.match(maintenance, /Never use an\s+unpinned force push/);
});

test("maintenance protection mutation authorizes one exact endpoint and response", async () => {
  const [skill, wrapper] = await Promise.all([readFile(skillPath, "utf8"), readFile(maintenanceWrapperPath, "utf8")]);

  assert.match(skill, /Use the checked-in `<skill-dir>\/scripts\/maintenance-publish\.ps1` helper/);
  assert.match(wrapper, /\$protectionEndpoint = "repos\/\$Owner\/\$Repo\/branches\/master\/protection"/);
  assert.match(wrapper, /\$adminEndpoint = "\$protectionEndpoint\/enforce_admins"/);
  assert.match(wrapper, /\$adminMethod = "DELETE"/);
  assert.match(wrapper, /Get-MaintenanceResponseStatus \$deleteResponse\) -ne 204/);
  assert.match(wrapper, /Test-MaintenanceResponseBoolean \$disabledState\.Admin \$false/);
  assert.match(wrapper, /Test-MaintenanceProtectionWithoutAdmin \$savedProtection/);
});

test("maintenance protection restoration compares the complete snapshot and bounds retry", async () => {
  const [skill, wrapper] = await Promise.all([readFile(skillPath, "utf8"), readFile(maintenanceWrapperPath, "utf8")]);

  assert.match(skill, /parsed protection object as the immutable restore snapshot/);
  assert.match(skill, /compare JSON\s+semantically by object keys and array values/);
  assert.match(
    skill,
    /If any response,\s+admin state, or protection field differs from the saved snapshot, it\s+retries that exact POST once/,
  );
  assert.match(skill, /It never\s+retries an unknown mutation before its\s+complete readback/);
  assert.match(skill, /If the second readback\s+still differs, it stops and\s+reports the exact remaining difference/);
  assert.match(skill, /If\s+admin enforcement was initially\s+disabled, it does not call POST/);
  assert.match(wrapper, /for \(\$attempt = 1; \$attempt -le 2; \$attempt\+\+\)/);
  assert.match(
    wrapper,
    /Test-MaintenanceEqual \$savedProtection \(Get-MaintenancePropertyValue \$restoredState\.Protection "Body"\)/,
  );
});

test("usage describes the maintenance protection boundary", async () => {
  const usage = await readFile(usagePath, "utf8");
  assert.match(usage, /For a maintenance-only release, the skill snapshots the complete\s+`master`\s+protection/);
  assert.match(usage, /`branches\/master\/protection\/enforce_admins` endpoint and HTTP response/);
  assert.match(usage, /An endpoint, response, or readback mismatch stops before the\s+push/);
  assert.match(usage, /failed restoration gets one bounded retry/);
});

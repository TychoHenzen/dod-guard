import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { prose } from "../../../lib/skill-text.mjs";

const skillPath = new URL("../SKILL.md", import.meta.url);
const usagePath = new URL("../../../USAGE.md", import.meta.url);
const defaultsPath = new URL("../../../standards/working-defaults.md", import.meta.url);
const maintenanceWrapperPath = fileURLToPath(new URL("./maintenance-publish.ps1", import.meta.url));

function maintenanceSection(skill) {
  const start = skill.indexOf("7. For a `maintenance-only` release:");
  const end = skill.indexOf("8. For a `functional` release", start);
  assert.ok(start >= 0 && end > start);
  return skill.slice(start, end);
}

test("maintenance releases skip PBI and PR and pin the force push", async () => {
  const [skill, defaults] = await Promise.all([readFile(skillPath, "utf8"), readFile(defaultsPath, "utf8")]);

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
  assert.match(skill, /A force-push\s+allowance alone does not bypass the PR or check rules/);
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
});

test("maintenance releases disable and restore admin enforcement through readbacks", async () => {
  const [skill, usage] = await Promise.all([readFile(skillPath, "utf8"), readFile(usagePath, "utf8")]);

  assert.match(skill, /Require both initial reads to return HTTP\s+`200` with non-empty objects/);
  assert.match(
    skill,
    /If the\s+saved `enforce_admins\.enabled` is true, the helper invokes only the\s+validated admin endpoint with/,
  );
  assert.match(skill, /admin_endpoint= repos\/\{owner\}\/\{repo\}\/branches\/master\/protection\/enforce_admins/);
  assert.match(skill, /does not\s+parse the deliberately empty body as\s+JSON/);
  assert.match(
    skill,
    prose(
      "reads the admin endpoint and complete protection object back even when the command " +
        "errors or returns an unexpected status; HTTP `200`, `enabled=false`",
    ),
  );
  assert.match(skill, /It marks restoration required before invoking DELETE/);
  assert.match(
    skill,
    prose(
      "every exit after an attempted DELETE, including commit, push, or pre-push validation " +
        "failure, restores the saved admin state",
    ),
  );
  assert.match(skill, /The helper owns the cleanup `finally` scope[\s\S]+restores the saved admin state/);
  assert.match(skill, /gh api --method POST <admin_endpoint>\s+--include/);
  assert.match(skill, /requires HTTP `200`/);
  assert.match(skill, /reads the admin endpoint and\s+complete protection object back after every POST attempt/);
  assert.match(skill, /retries that exact POST once and reads both resources again/);
  assert.match(skill, /If either\s+read throws,\s+it stops without a second POST/);
  assert.match(
    usage,
    prose(
      "A successful maintenance result reports the published SHA, the lease SHA, full protection " +
        "restoration equality, the restore retry count, required-check status, and client-refresh status",
    ),
  );
  assert.match(usage, /Missing cleanup or any required evidence is a\s+failure, not a successful release/);
});

test("maintenance releases classify pending paths before a primary-checkout transition", async () => {
  const [skill, defaults, usage] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(defaultsPath, "utf8"),
    readFile(usagePath, "utf8"),
  ]);
  const inspectStart = skill.indexOf("1. Inspect");
  const inspectEnd = skill.indexOf("2. Before committing", inspectStart);
  assert.ok(inspectStart >= 0 && inspectEnd > inspectStart);
  const inspection = skill.slice(inspectStart, inspectEnd);
  const maintenance = maintenanceSection(skill);

  assert.match(inspection, /git status --short --branch --untracked-files=all/);
  assert.match(
    inspection,
    /Classify every staged, unstaged, tracked,\s+and untracked path before branch or ref movement/,
  );
  assert.match(
    inspection,
    prose(
      "If any path is credential-like, destructive, unrelated, or indistinguishable, report the " +
        "exact paths and stop before changing the checkout or refs",
    ),
  );
  assert.match(
    maintenance,
    prose(
      "Confirm the checkout is primary by resolving",
      "git rev-parse --path-format=absolute --git-dir",
      "git rev-parse --path-format=absolute --git-common-dir",
    ),
  );
  assert.match(maintenance, /Use\s+`git switch --detach <saved-sha>` in this same checkout/);
  assert.match(maintenance, /Continue only if\s+Git retains every classified release path without conflict/);
  assert.match(
    maintenance,
    prose(
      "starting branch reference is unchanged, then rerun the repository inspector and release " +
        "gates against this exact base",
    ),
  );
  assert.match(maintenance, /Stage only the classified release\s+paths; never use blanket staging/);
  assert.match(maintenance, /release commit's parent to equal the saved SHA/);
  assert.doesNotMatch(maintenance, /separate worktree|create that worktree|git worktree\b/);
  assert.match(
    defaults,
    prose(
      "maintenance-only `/publish` route stays in the existing primary checkout and never runs a " +
        "Git worktree command",
    ),
  );
  assert.doesNotMatch(defaults, /exact-`origin\/master` worktree/);
  assert.match(
    usage,
    /Maintenance publishing stays in the existing primary checkout and does not\s+run Git worktree commands/,
  );
});

test("maintenance checkout failures preserve the starting state and release checkpoint", async () => {
  const maintenance = maintenanceSection(await readFile(skillPath, "utf8"));

  assert.match(
    maintenance,
    prose(
      "If either value is unavailable or the paths differ, stop before any branch/ref, release, " +
        "protection, or cache mutation",
    ),
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
    prose(
      "If any response, admin state, or protection field differs from the saved snapshot, it " +
        "retries that exact POST once",
    ),
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

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const skillPath = new URL("../SKILL.md", import.meta.url);
const usagePath = new URL("../../../USAGE.md", import.meta.url);

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    windowsHide: true,
  });
}

function runGit(cwd, ...args) {
  const result = git(cwd, args);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function createPrimaryCheckout(t) {
  const cwd = await mkdtemp(join(tmpdir(), "dod-guard-publish-primary-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  runGit(cwd, "init");
  runGit(cwd, "config", "user.name", "Publish test");
  runGit(cwd, "config", "user.email", "publish-test@example.invalid");
  runGit(cwd, "config", "commit.gpgsign", "false");
  runGit(cwd, "branch", "-M", "master");
  await writeFile(join(cwd, "tracked.txt"), "base\n");
  runGit(cwd, "add", "--", "tracked.txt");
  runGit(cwd, "commit", "-m", "chore: create base");
  return cwd;
}

test("publish guidance exposes the exact cross-client refresh sequence", async () => {
  const documents = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(usagePath, "utf8"),
  ]);

  for (const document of documents) {
    assert.match(document, /Claude Code: \/plugin marketplace update dod-guard, then \/reload-plugins/);
    assert.match(document, /Codex: codex plugin marketplace upgrade dod-guard-monorepo/);
    assert.match(document, /Codex: codex plugin add dod-guard@dod-guard-monorepo/);
    assert.doesNotMatch(document, /Claude Code: \/plugin update(?:,| and)/);
  }
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
  const commit = skill.indexOf("Use `/commit`'s staging and commit-message steps only");

  assert.ok(scan >= 0 && scan < commit);
  assert.match(skill, /Stop when `credentialFindings` is non-empty/);
  assert.match(skill, /Never print matched values/);
});

test("publish resolves the exact active installation before release work", async () => {
  const [skill, usage] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(usagePath, "utf8"),
  ]);
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
  const defaults = await readFile(
    new URL("../../../standards/working-defaults.md", import.meta.url),
    "utf8",
  );
  const usage = await readFile(usagePath, "utf8");

  assert.match(skill, /paired version-only bump made solely to invalidate the cache for\s+maintenance content remains `maintenance-only`/);
  assert.match(skill, /For a `maintenance-only` release:[\s\S]+Do not require or create a PBI, feature branch, or pull request/);
  assert.match(skill, /release commit's parent\s+to equal the saved SHA/);
  assert.match(skill, /`allow_force_pushes\.enabled` to be true/);
  assert.match(skill, /--force-with-lease=refs\/heads\/master:<saved-sha>/);
  assert.match(skill, /lease rejects any intervening update/);
  assert.match(skill, /Never use an\s+unpinned force push/);
  assert.match(skill, /Require both initial reads to return HTTP\s+`200` with non-empty objects/);
  assert.match(skill, /If the\s+saved `enforce_admins\.enabled` is true, invoke only the validated admin\s+endpoint with/);
  assert.match(skill, /admin_endpoint= repos\/\{owner\}\/\{repo\}\/branches\/master\/protection\/enforce_admins/);
  assert.match(skill, /do not\s+parse the deliberately empty body as JSON/);
  assert.match(skill, /Read the admin endpoint\s+back\s+even when the command errors or returns an unexpected status[\s\S]+Require\s+HTTP\s+`200`, a valid response object, and `enabled=false`/);
  assert.match(skill, /A force-push\s+allowance alone does not bypass the PR or check rules/);
  assert.match(skill, /Enter the cleanup scope and mark restoration required before invoking this\s+DELETE/);
  assert.match(skill, /every exit after an attempted DELETE, including\s+a failed pre-push readback, runs the cleanup scope/);
  assert.match(skill, /In a `finally` step[\s\S]+restore the saved\s+admin state[\s\S]+complete\s+protection object\s+back/);
  assert.match(skill, /gh api --method POST <admin_endpoint>\s+--include\s+--silent/);
  assert.match(skill, /do not use its suppressed body as a\s+success predicate/);
  assert.match(skill, /Read the admin endpoint and complete protection object\s+back after every POST attempt/);
  assert.match(skill, /retry that exact\s+`POST`\s+once and read both resources again/);
  assert.match(skill, /Other users\s+remain subject to the branch rules/);
  assert.match(skill, /`\/commit`'s staging and commit-message steps only/);
  assert.match(skill, /Do not run its\s+ordinary push, sync, or pull-and-merge retry/);
  assert.doesNotMatch(skill, /If branch protection requires a pull request, stop/);
  assert.match(defaults, /The explicit `\/publish` maintenance-only route may[\s\S]+temporarily disable only admin enforcement/);
  assert.match(skill, /After a direct maintenance push or a merged functional release has green CI/);
  assert.match(usage, /A successful maintenance result reports the published SHA, the lease SHA, full\s+protection restoration equality, the restore retry count, required-check status,\s+and client-refresh status/);
  assert.match(usage, /Missing cleanup or any required evidence is a\s+failure, not a successful release/);
});

test("maintenance releases classify pending paths before a primary-checkout transition", async () => {
  const [skill, defaults, usage] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(new URL("../../../standards/working-defaults.md", import.meta.url), "utf8"),
    readFile(usagePath, "utf8"),
  ]);
  const inspectStart = skill.indexOf("1. Inspect");
  const inspectEnd = skill.indexOf("2. Before `/commit`", inspectStart);
  const maintenanceStart = skill.indexOf("7. For a `maintenance-only` release:");
  const functionalStart = skill.indexOf("8. For a `functional` release", maintenanceStart);
  const inspection = skill.slice(inspectStart, inspectEnd);
  const maintenance = skill.slice(maintenanceStart, functionalStart);

  assert.ok(inspectStart >= 0 && inspectEnd > inspectStart);
  assert.ok(maintenanceStart >= 0 && functionalStart > maintenanceStart);
  assert.match(inspection, /git status --short --branch --untracked-files=all/);
  assert.match(inspection, /Classify every staged, unstaged, tracked,\s+and untracked path before branch or ref movement/);
  assert.match(inspection, /If any path is\s+credential-like, destructive, unrelated, or indistinguishable, report the\s+exact paths and stop before changing the checkout or refs/);
  assert.match(maintenance, /Confirm the checkout is primary by resolving[\s\S]+git rev-parse --path-format=absolute --git-dir[\s\S]+git rev-parse --path-format=absolute --git-common-dir/);
  assert.match(maintenance, /Use\s+`git switch --detach <saved-sha>` in this same checkout/);
  assert.match(maintenance, /Continue only if\s+Git retains every classified release path without conflict/);
  assert.match(maintenance, /starting branch reference is\s+unchanged, then rerun the repository inspector and release gates against\s+this exact base/);
  assert.match(maintenance, /Stage only the classified release\s+paths; never use blanket staging/);
  assert.match(maintenance, /release commit's parent to equal the saved SHA/);
  assert.doesNotMatch(maintenance, /separate worktree|create that worktree|git worktree\b/);
  assert.match(defaults, /maintenance-only `\/publish` route stays in the existing primary checkout\s+and never runs a Git worktree command/);
  assert.doesNotMatch(defaults, /exact-`origin\/master` worktree/);
  assert.match(usage, /Maintenance publishing stays in the existing primary checkout and does not\s+run Git worktree commands/);
});

test("maintenance checkout failures preserve the starting state and release checkpoint", async () => {
  const skill = await readFile(skillPath, "utf8");
  const start = skill.indexOf("7. For a `maintenance-only` release:");
  const end = skill.indexOf("8. For a `functional` release", start);
  const maintenance = skill.slice(start, end);

  assert.match(maintenance, /If either value is unavailable\s+or the paths differ, stop before any branch\/ref, release, protection, or\s+cache mutation/);
  assert.match(maintenance, /if it refuses\s+the switch, verify and report the unchanged starting state, then stop/);
  assert.match(maintenance, /If master advances, restore protection, stop[\s\S]+preserve the exact release checkpoint/);
  assert.match(maintenance, /Never create another checkout, stash, or reset to carry release paths/);
  assert.match(maintenance, /Never use an\s+unpinned force push/);
});

test("same-checkout release transition retains staged, unstaged, and untracked release paths", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const savedSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "switch", "-c", "codex/source");
  await writeFile(join(cwd, "staged-release.txt"), "staged release\n");
  runGit(cwd, "add", "--", "staged-release.txt");
  await writeFile(join(cwd, "tracked.txt"), "unstaged release\n");
  await writeFile(join(cwd, "untracked-release.txt"), "untracked release\n");

  const gitDirectory = runGit(cwd, "rev-parse", "--path-format=absolute", "--git-dir");
  const commonDirectory = runGit(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  assert.equal(resolve(gitDirectory), resolve(commonDirectory));

  runGit(cwd, "switch", "--detach", savedSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), savedSha);
  assert.equal(runGit(cwd, "rev-parse", "refs/heads/codex/source"), savedSha);
  assert.match(runGit(cwd, "status", "--porcelain=v1", "--untracked-files=all"), /A  staged-release\.txt[\s\S]+ M tracked\.txt[\s\S]+\?\? untracked-release\.txt/);
  assert.equal(await readFile(join(cwd, "staged-release.txt"), "utf8"), "staged release\n");
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "unstaged release\n");
  assert.equal(await readFile(join(cwd, "untracked-release.txt"), "utf8"), "untracked release\n");

  runGit(cwd, "add", "--", "staged-release.txt", "tracked.txt", "untracked-release.txt");
  runGit(cwd, "commit", "-m", "chore: add release content");
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});

test("same-checkout release uses the fetched origin master SHA as its parent", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const remote = join(cwd, ".git", "local-origin.git");
  runGit(cwd, "init", "--bare", remote);
  runGit(cwd, "remote", "add", "origin", remote);
  runGit(cwd, "push", "-u", "origin", "master");
  const startingSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "-c", "codex/source");
  runGit(cwd, "switch", "-c", "codex/remote-master-advance", startingSha);
  await writeFile(join(cwd, "remote-change.txt"), "remote master content\n");
  runGit(cwd, "add", "--", "remote-change.txt");
  runGit(cwd, "commit", "-m", "chore: advance remote master");
  const remoteMasterSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "push", "origin", "HEAD:refs/heads/master");
  runGit(cwd, "switch", "codex/source");
  runGit(cwd, "fetch", "origin", "master");

  const savedSha = runGit(cwd, "rev-parse", "origin/master");
  assert.notEqual(savedSha, startingSha);
  assert.equal(savedSha, remoteMasterSha);
  runGit(cwd, "switch", "--detach", savedSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), savedSha);
  assert.equal(runGit(cwd, "rev-parse", "refs/heads/codex/source"), startingSha);

  await writeFile(join(cwd, "release.txt"), "release content\n");
  runGit(cwd, "add", "--", "release.txt");
  runGit(cwd, "commit", "-m", "chore: prepare release");
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});

test("failed same-checkout transition preserves the branch, index, and user paths", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const startingSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "switch", "-c", "codex/source");
  runGit(cwd, "switch", "master");
  await writeFile(join(cwd, "tracked.txt"), "master change\n");
  await writeFile(join(cwd, "target-file.txt"), "master file\n");
  runGit(cwd, "add", "--", "tracked.txt", "target-file.txt");
  runGit(cwd, "commit", "-m", "chore: advance release base");
  const savedSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "switch", "codex/source");
  await writeFile(join(cwd, "staged-release.txt"), "staged release\n");
  runGit(cwd, "add", "--", "staged-release.txt");
  await writeFile(join(cwd, "tracked.txt"), "pending release\n");
  await writeFile(join(cwd, "target-file.txt"), "untracked user file\n");
  const pendingStatus = runGit(cwd, "status", "--porcelain=v1", "--untracked-files=all");

  const transition = git(cwd, ["switch", "--detach", savedSha]);
  assert.notEqual(transition.status, 0);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), startingSha);
  assert.equal(runGit(cwd, "rev-parse", "refs/heads/codex/source"), startingSha);
  assert.equal(runGit(cwd, "status", "--porcelain=v1", "--untracked-files=all"), pendingStatus);
  assert.equal(await readFile(join(cwd, "staged-release.txt"), "utf8"), "staged release\n");
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "pending release\n");
  assert.equal(await readFile(join(cwd, "target-file.txt"), "utf8"), "untracked user file\n");
});

test("saved force-with-lease rejects a remote master advance and retains the release commit", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const remote = join(cwd, ".git", "local-origin.git");
  runGit(cwd, "init", "--bare", remote);
  runGit(cwd, "remote", "add", "origin", remote);
  runGit(cwd, "push", "-u", "origin", "master");
  const savedSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "--detach", savedSha);
  await writeFile(join(cwd, "release.txt"), "release content\n");
  runGit(cwd, "add", "--", "release.txt");
  runGit(cwd, "commit", "-m", "chore: prepare release");
  const releaseSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "-c", "codex/remote-advance", savedSha);
  await writeFile(join(cwd, "remote-change.txt"), "new master content\n");
  runGit(cwd, "add", "--", "remote-change.txt");
  runGit(cwd, "commit", "-m", "chore: advance master");
  const advancedSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "push", "origin", "HEAD:refs/heads/master");
  runGit(cwd, "switch", "--detach", releaseSha);

  const push = git(cwd, [
    "push",
    `--force-with-lease=refs/heads/master:${savedSha}`,
    "origin",
    "HEAD:refs/heads/master",
  ]);
  assert.notEqual(push.status, 0);
  assert.equal(runGit(cwd, "--git-dir", remote, "rev-parse", "refs/heads/master"), advancedSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), releaseSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});

test("maintenance protection mutation authorizes one exact endpoint and response", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /Before any protection mutation, construct and validate these exact values/);
  assert.match(skill, /admin_endpoint= repos\/\{owner\}\/\{repo\}\/branches\/master\/protection\/enforce_admins/);
  assert.match(skill, /admin_method= DELETE/);
  assert.match(skill, /Require the admin endpoint to equal the literal[\s\S]+`DELETE`/);
  assert.match(skill, /never\s+send `DELETE`, `POST`, or `PUT` to it/);
  assert.match(skill, /--method DELETE <admin_endpoint> --include --silent/);
  assert.match(skill, /require HTTP `204`/);
  assert.match(skill, /Require\s+HTTP\s+`200`, a valid response object, and `enabled=false`/);
  assert.match(skill, /invalid path, method, status, body, or\s+readback stops before the push/);
});

test("maintenance protection restoration compares the complete snapshot and bounds retry", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /parsed protection object as the immutable restore snapshot/);
  assert.match(skill, /compare JSON\s+semantically by object keys and array values/);
  assert.match(skill, /complete\s+protection field differs from the saved snapshot, retry that exact `POST`\s+once/);
  assert.match(skill, /Do not retry an unknown mutation before\s+its readback/);
  assert.match(skill, /second readback still differs, stop and report the\s+exact remaining difference/);
  assert.match(skill, /If admin\s+enforcement was initially disabled, do not call `POST`/);
});

const protectionEndpoint = "repos/{owner}/{repo}/branches/master/protection";
const adminEndpoint = `${protectionEndpoint}/enforce_admins`;

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function sameProtection(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function withoutAdminField(protection) {
  if (!protection?.enforce_admins || typeof protection.enforce_admins.enabled !== "boolean") {
    return null;
  }
  return Object.fromEntries(
    Object.entries(protection ?? {}).filter(([key]) => key !== "enforce_admins"),
  );
}

function sameProtectionWithoutAdmin(left, right) {
  const comparableLeft = withoutAdminField(left);
  const comparableRight = withoutAdminField(right);
  return (
    comparableLeft !== null &&
    comparableRight !== null &&
    sameProtection(comparableLeft, comparableRight)
  );
}

function evaluateProtectionDecision({
  endpoint,
  method,
  deleteResponse,
  initialAdminReadback,
  initialProtectionReadback,
  adminReadback,
  protectionReadback,
  savedProtection,
}) {
  if (
    initialProtectionReadback?.status !== 200 ||
    !initialProtectionReadback.body ||
    Object.keys(initialProtectionReadback.body).length === 0 ||
    typeof initialProtectionReadback.body.enforce_admins?.enabled !== "boolean" ||
    initialAdminReadback?.status !== 200 ||
    !initialAdminReadback.body ||
    typeof initialAdminReadback.body.enabled !== "boolean" ||
    initialProtectionReadback.body.enforce_admins.enabled !== initialAdminReadback.body.enabled
  ) {
    return { proceed: false, reason: "initial-readback" };
  }
  if (endpoint !== adminEndpoint || method !== "DELETE") {
    return { proceed: false, reason: "request" };
  }
  if (deleteResponse?.status !== 204 || deleteResponse.body !== "") {
    return { proceed: false, reason: "delete-response" };
  }
  if (
    adminReadback?.status !== 200 ||
    !adminReadback.body ||
    adminReadback.body.enabled !== false
  ) {
    return { proceed: false, reason: "admin-readback" };
  }
  if (
    protectionReadback?.status !== 200 ||
    !sameProtectionWithoutAdmin(savedProtection, protectionReadback.body)
  ) {
    return { proceed: false, reason: "protection-readback" };
  }
  return { proceed: true, reason: "authorized" };
}

function runMaintenancePath(input) {
  if (input.classification !== "maintenance-only") {
    return { proceed: false, reason: "classification" };
  }
  return evaluateProtectionDecision(input);
}

function restoreProtection(savedProtection, readState, restore) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = restore();
    const state = readState();
    if (
      response?.status === 200 &&
      state?.admin?.status === 200 &&
      state.admin.body?.enabled === true &&
      state?.protection?.status === 200 &&
      sameProtection(savedProtection, state.protection.body)
    ) {
      return attempt;
    }
  }
  return null;
}

function createProtectionFixture() {
  return {
    url: "https://api.github.com/repos/{owner}/{repo}/branches/master/protection",
    required_status_checks: {
      url: "https://api.github.com/repos/{owner}/{repo}/branches/master/protection/required_status_checks",
      strict: true,
      contexts: [
        "build-test",
        "plugin-config",
        "static-analysis",
        "package-integrity",
      ],
      contexts_url: "https://api.github.com/repos/{owner}/{repo}/branches/master/protection/required_status_checks/contexts",
      checks: [
        { context: "build-test", app_id: 15368 },
        { context: "plugin-config", app_id: 15368 },
        { context: "static-analysis", app_id: 15368 },
        { context: "package-integrity", app_id: 15368 },
      ],
    },
    required_pull_request_reviews: {
      url: "https://api.github.com/repos/{owner}/{repo}/branches/master/protection/required_pull_request_reviews",
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      require_last_push_approval: false,
      required_approving_review_count: 0,
    },
    required_signatures: {
      url: "https://api.github.com/repos/{owner}/{repo}/branches/master/protection/required_signatures",
      enabled: false,
    },
    allow_deletions: { enabled: false },
    enforce_admins: { enabled: true },
    required_linear_history: { enabled: false },
    allow_force_pushes: { enabled: true },
    block_creations: { enabled: false },
    required_conversation_resolution: { enabled: true },
    lock_branch: { enabled: false },
    allow_fork_syncing: { enabled: false },
  };
}

function createValidMaintenanceInput() {
  const savedProtection = createProtectionFixture();
  return {
    classification: "maintenance-only",
    endpoint: adminEndpoint,
    method: "DELETE",
    deleteResponse: { status: 204, body: "" },
    initialAdminReadback: { status: 200, body: { enabled: true } },
    initialProtectionReadback: { status: 200, body: savedProtection },
    adminReadback: { status: 200, body: { enabled: false } },
    protectionReadback: {
      status: 200,
      body: { ...savedProtection, enforce_admins: { enabled: false } },
    },
    savedProtection,
  };
}

test("maintenance fixture reaches the push boundary only after classification and protection proof", async () => {
  const usage = await readFile(usagePath, "utf8");
  const validInput = createValidMaintenanceInput();

  assert.deepEqual(runMaintenancePath(validInput), {
    proceed: true,
    reason: "authorized",
  });
  assert.match(usage, /For a maintenance-only release, the skill snapshots the complete\s+`master`\s+protection/);
  assert.match(usage, /`branches\/master\/protection\/enforce_admins` endpoint and HTTP response/);
  assert.match(usage, /An endpoint, response, or readback mismatch stops before the\s+push/);
  assert.match(usage, /failed restoration gets one bounded retry/);
  assert.equal(
    runMaintenancePath({ ...validInput, classification: "functional" }).proceed,
    false,
  );
});

test("maintenance fixture rejects endpoint and method drift before mutation", () => {
  const validInput = createValidMaintenanceInput();

  for (const invalidRequest of [
    { endpoint: protectionEndpoint, method: "DELETE" },
    { endpoint: adminEndpoint, method: "POST" },
  ]) {
    const outcome = runMaintenancePath({ ...validInput, ...invalidRequest });
    assert.deepEqual(outcome, { proceed: false, reason: "request" });
  }
});

test("maintenance fixture fails closed for empty, failed, malformed, or stale readbacks", () => {
  const validInput = createValidMaintenanceInput();
  const savedProtection = validInput.savedProtection;
  const invalidResponses = [
    { initialProtectionReadback: { status: 500, body: {} } },
    { initialAdminReadback: { status: 200, body: { enabled: false } } },
    {
      initialProtectionReadback: {
        status: 200,
        body: { ...savedProtection, enforce_admins: undefined },
      },
    },
    { deleteResponse: undefined },
    { deleteResponse: { status: 500, body: "failure" } },
    { deleteResponse: { status: 204, body: "malformed" } },
    { adminReadback: { status: 200, body: { enabled: true } } },
    {
      protectionReadback: {
        status: 200,
        body: {
          ...savedProtection,
          enforce_admins: { enabled: false },
          required_status_checks: { strict: false, contexts: [] },
        },
      },
    },
  ];

  for (const invalidResponse of invalidResponses) {
    const outcome = runMaintenancePath({ ...validInput, ...invalidResponse });
    assert.equal(outcome.proceed, false);
  }
});

test("protection fixture retries one restore and stops on a second full-state mismatch", () => {
  const savedProtection = createProtectionFixture();
  let currentProtection = {
    ...savedProtection,
    enforce_admins: { enabled: false },
  };
  let restoreCalls = 0;

  const attempts = restoreProtection(
    savedProtection,
    () => ({
      admin: {
        status: 200,
        body: { enabled: currentProtection.enforce_admins.enabled },
      },
      protection: { status: 200, body: currentProtection },
    }),
    () => {
      restoreCalls += 1;
      if (restoreCalls === 2) currentProtection = savedProtection;
      return { status: 200, body: { enabled: true } };
    },
  );

  assert.equal(attempts, 2);
  assert.equal(restoreCalls, 2);
  assert.equal(
    restoreProtection(
      savedProtection,
      () => ({
        admin: {
          status: 200,
          body: { enabled: currentProtection.enforce_admins.enabled },
        },
        protection: { status: 200, body: currentProtection },
      }),
      () => ({ status: 200, body: { enabled: true } }),
    ),
    1,
  );
  assert.equal(
    restoreProtection(
      savedProtection,
      () => ({
        admin: { status: 200, body: { enabled: false } },
        protection: {
          status: 200,
          body: { ...currentProtection, enforce_admins: { enabled: false } },
        },
      }),
      () => ({ status: 200, body: { enabled: true } }),
    ),
    null,
  );
  const failedRestoreEvents = [];
  assert.equal(
    restoreProtection(
      savedProtection,
      () => {
        failedRestoreEvents.push("read");
        return {
          admin: { status: 200, body: { enabled: true } },
          protection: { status: 200, body: currentProtection },
        };
      },
      () => {
        failedRestoreEvents.push("restore");
        return { status: 500, body: {} };
      },
    ),
    null,
  );
  assert.deepEqual(failedRestoreEvents, ["restore", "read", "restore", "read"]);
});

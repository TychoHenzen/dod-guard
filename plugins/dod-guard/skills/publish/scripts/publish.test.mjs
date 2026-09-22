import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skillPath = new URL("../SKILL.md", import.meta.url);
const usagePath = new URL("../../../USAGE.md", import.meta.url);

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

test("maintenance releases skip PBI and PR while restoring protection", async () => {
  const skill = await readFile(skillPath, "utf8");
  const defaults = await readFile(
    new URL("../../../standards/working-defaults.md", import.meta.url),
    "utf8",
  );

  assert.match(skill, /paired version-only bump made solely to invalidate the cache for\s+maintenance content remains `maintenance-only`/);
  assert.match(skill, /For a `maintenance-only` release:[\s\S]+Do not require or create a PBI, feature branch, or pull request/);
  assert.match(skill, /release commit's parent\s+to equal it/);
  assert.match(skill, /`allow_force_pushes\.enabled` to be true/);
  assert.match(skill, /--force-with-lease=refs\/heads\/master:<saved-sha>/);
  assert.match(skill, /lease rejects any intervening update/);
  assert.match(skill, /Never use an\s+unpinned force push/);
  assert.match(skill, /If the\s+saved `enforce_admins\.enabled` is true, invoke only the validated admin\s+endpoint with/);
  assert.match(skill, /admin_endpoint= repos\/\{owner\}\/\{repo\}\/branches\/master\/protection\/enforce_admins/);
  assert.match(skill, /do not\s+parse the deliberately empty body as JSON/);
  assert.match(skill, /Read the admin endpoint back\s+even when the command errors or returns an unexpected status[\s\S]+Require HTTP\s+`200`, a valid response object, and `enabled=false`/);
  assert.match(skill, /A force-push\s+allowance alone does not bypass the PR or check rules/);
  assert.match(skill, /In a `finally` step, restore the saved\s+admin state[\s\S]+complete\s+protection object back/);
  assert.match(skill, /gh api --method POST <admin_endpoint> --include --silent/);
  assert.match(skill, /retry that exact\s+`POST`\s+once and read both resources again/);
  assert.match(skill, /Other users\s+remain subject to the branch rules/);
  assert.match(skill, /`\/commit`'s staging and commit-message steps only/);
  assert.match(skill, /Do not run its\s+ordinary push, sync, or pull-and-merge retry/);
  assert.doesNotMatch(skill, /If branch protection requires a pull request, stop/);
  assert.match(defaults, /The explicit `\/publish` maintenance-only route may[\s\S]+temporarily disable only admin enforcement/);
  assert.match(skill, /After a direct maintenance push or a merged functional release has green CI/);
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
  assert.match(skill, /Require HTTP\s+`200`, a valid response object, and `enabled=false`/);
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
  return Object.fromEntries(
    Object.entries(protection ?? {}).filter(([key]) => key !== "enforce_admins"),
  );
}

function evaluateProtectionDecision({
  endpoint,
  method,
  deleteResponse,
  adminReadback,
  protectionReadback,
  savedProtection,
}) {
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
    !sameProtection(
      withoutAdminField(savedProtection),
      withoutAdminField(protectionReadback.body),
    )
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

function restoreProtection(savedProtection, readProtection, restore) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = restore();
    if (
      response?.status === 200 &&
      response.body?.enabled === true &&
      sameProtection(savedProtection, readProtection())
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

test("maintenance fixture reaches the push boundary only after classification and protection proof", async () => {
  const usage = await readFile(usagePath, "utf8");
  const savedProtection = createProtectionFixture();
  const protectionReadback = {
    ...savedProtection,
    enforce_admins: { enabled: false },
  };
  const validInput = {
    classification: "maintenance-only",
    endpoint: adminEndpoint,
    method: "DELETE",
    deleteResponse: { status: 204, body: "" },
    adminReadback: { status: 200, body: { enabled: false } },
    protectionReadback: { status: 200, body: protectionReadback },
    savedProtection,
  };

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
  const savedProtection = createProtectionFixture();
  const validInput = {
    classification: "maintenance-only",
    endpoint: adminEndpoint,
    method: "DELETE",
    deleteResponse: { status: 204, body: "" },
    adminReadback: { status: 200, body: { enabled: false } },
    protectionReadback: {
      status: 200,
      body: { ...savedProtection, enforce_admins: { enabled: false } },
    },
    savedProtection,
  };

  for (const invalidRequest of [
    { endpoint: protectionEndpoint, method: "DELETE" },
    { endpoint: adminEndpoint, method: "POST" },
  ]) {
    const outcome = runMaintenancePath({ ...validInput, ...invalidRequest });
    assert.deepEqual(outcome, { proceed: false, reason: "request" });
  }
});

test("maintenance fixture fails closed for empty, failed, malformed, or stale readbacks", () => {
  const savedProtection = createProtectionFixture();
  const validInput = {
    classification: "maintenance-only",
    endpoint: adminEndpoint,
    method: "DELETE",
    deleteResponse: { status: 204, body: "" },
    adminReadback: { status: 200, body: { enabled: false } },
    protectionReadback: {
      status: 200,
      body: { ...savedProtection, enforce_admins: { enabled: false } },
    },
    savedProtection,
  };
  const invalidResponses = [
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
    () => currentProtection,
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
      () => currentProtection,
      () => ({ status: 200, body: { enabled: true } }),
    ),
    1,
  );
  assert.equal(
    restoreProtection(
      savedProtection,
      () => ({ ...currentProtection, enforce_admins: { enabled: false } }),
      () => ({ status: 200, body: { enabled: true } }),
    ),
    null,
  );
  assert.equal(
    restoreProtection(
      savedProtection,
      () => currentProtection,
      () => ({ status: 500, body: {} }),
    ),
    null,
  );
});

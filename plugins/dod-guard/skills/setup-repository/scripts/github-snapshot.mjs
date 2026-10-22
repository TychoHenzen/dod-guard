import { classifyOpenProjects } from "../../../lib/linked-project-response.mjs";

const REQUIRED_STATUSES = ["Backlog", "Todo", "In Progress", "Done"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countStatus(options, required) {
  return options.filter((option) => typeof option === "string" && option.toLowerCase() === required.toLowerCase())
    .length;
}

function statusOptionBlockers(project) {
  const blockers = [];
  const options = Array.isArray(project.statusOptions) ? project.statusOptions : [];
  if (!Array.isArray(project.statusOptions)) {
    blockers.push("linked Project status options are missing or malformed");
  }
  for (const required of REQUIRED_STATUSES) {
    const count = countStatus(options, required);
    if (count !== 1) blockers.push(`expected one ${required} status, found ${count}`);
  }
  return blockers;
}

function projectBlockers(snapshot) {
  const blockers = [];
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  if (!Array.isArray(snapshot.projects)) blockers.push("linked Project snapshot is missing or malformed");
  const { outcome, open: openProjects } = classifyOpenProjects(projects);
  if (outcome !== "resolved") {
    blockers.push(`expected exactly one open linked Project, found ${openProjects.length}`);
    return blockers;
  }
  return [...blockers, ...statusOptionBlockers(openProjects[0])];
}

function checkName(check) {
  return typeof check.name === "string" ? check.name : "<unnamed>";
}

function isCheckObject(check) {
  return Boolean(check) && typeof check === "object";
}

function checkResultBlockers(check) {
  if (!isCheckObject(check)) return ["check result is missing or malformed"];
  if (check.conclusion === "SUCCESS") return [];
  return [`check ${checkName(check)} concluded ${check.conclusion ?? "unknown"}`];
}

function checkBlockers(snapshot, checks) {
  const blockers = [];
  if (!Array.isArray(snapshot.checks)) blockers.push("check snapshot is missing or malformed");
  if (checks.length === 0) blockers.push("no required check results were supplied");
  for (const check of checks) blockers.push(...checkResultBlockers(check));
  return blockers;
}

function uniqueCheckNames(checks) {
  const names = checks.map((check) => check?.name).filter((name) => typeof name === "string" && name.length > 0);
  return [...new Set(names)].sort();
}

function buildProtectionPayload(contexts) {
  return {
    required_status_checks: { strict: true, contexts },
    enforce_admins: true,
    required_pull_request_reviews: { required_approving_review_count: 0 },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: false,
    allow_fork_syncing: false,
  };
}

export function assessGitHubSnapshot(snapshot) {
  if (!isRecord(snapshot)) {
    return {
      readyForProtection: false,
      blockers: ["GitHub snapshot must be an object"],
      requiredChecks: [],
      protectionPayload: null,
    };
  }
  const checks = Array.isArray(snapshot.checks) ? snapshot.checks : [];
  const requiredChecks = uniqueCheckNames(checks);
  const blockers = [...projectBlockers(snapshot), ...checkBlockers(snapshot, checks)];
  if (requiredChecks.length !== checks.length) blockers.push("required check names are missing or duplicated");
  const ready = blockers.length === 0;
  return {
    readyForProtection: ready,
    blockers,
    requiredChecks,
    protectionPayload: ready ? buildProtectionPayload(requiredChecks) : null,
  };
}

// The classification rules behind resume-state.mjs. Every function is pure.
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";

const HANDOFF_HEADING = "## Implementation handoff";
const PLAN_PREFIX = "## Step plan:";
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const LINE_BREAK = /\r?\n/;
const MIN_SHA_LENGTH = 7;

function firstLine(comment) {
  return String(comment?.body ?? "")
    .trimStart()
    .split(LINE_BREAK, 1)[0]
    .trimEnd();
}

function isBy(comment, login) {
  return String(comment.user?.login).toLowerCase() === login.toLowerCase();
}

// The step plan rule of standards/project-workflow.md: the heading, and the authenticated user or a trusted role.
function isPlan(comment, login) {
  const trusted = isBy(comment, login) || TRUSTED.has(comment.author_association);
  return firstLine(comment).startsWith(PLAN_PREFIX) && trusted;
}

function taskOf(comment) {
  return firstLine(comment).slice(PLAN_PREFIX.length).trim();
}

function postedAt(comment) {
  return Date.parse(comment.created_at);
}

function latest(comments) {
  return comments.reduce(
    (best, next) => (best === undefined || postedAt(next) > postedAt(best) ? next : best),
    undefined,
  );
}

function namesTip(handoff, tip) {
  const head = readHandoffMatrix(handoff.body).rows?.[0]?.headSha;
  const sha = typeof head === "string" ? head.toLowerCase() : "";
  return sha.length >= MIN_SHA_LENGTH && tip.toLowerCase().startsWith(sha);
}

// A task whose plan was posted more than once and whose newest plan postdates the tip: the plan was replaced after
// the work. A first plan for a task (the step-plan-missing flow) is never a replacement.
function replacedPlan(comments, login, tipTime) {
  const byTask = Map.groupBy(
    comments.filter((comment) => isPlan(comment, login)),
    taskOf,
  );
  const newest = [...byTask.values()].filter((plans) => plans.length > 1).map(latest);
  return latest(newest.filter((plan) => postedAt(plan) > tipTime));
}

function classify({ comments, login, tip, tipDate, ahead }) {
  const own = comments.filter((comment) => firstLine(comment) === HANDOFF_HEADING && isBy(comment, login));
  const handoff = latest(own);
  if (handoff !== undefined && namesTip(handoff, tip)) {
    return { state: "live-handoff", reason: `handoff comment ${handoff.id} names the branch tip ${tip}` };
  }
  const plan = ahead > 0 ? replacedPlan(comments, login, Date.parse(tipDate)) : undefined;
  if (plan !== undefined) {
    const task = taskOf(plan);
    const reason = `step plan comment ${plan.id} for ${task} replaced an earlier plan after the branch tip ${tip}`;
    return { state: "superseded", reason };
  }
  return { state: "resumable", reason: "no handoff names the tip and no step plan was replaced after it" };
}

export { classify };

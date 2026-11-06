// Picks the one current `## Implementation handoff` comment from an issue's comments and plans how the
// older ones are demoted. The newest by creation time is the handoff, the same rule that settles several
// step plans for one task: a rebuild at a later head is posted after the stale one it replaces, so keeping
// the earliest would keep the stale record. A demoted comment keeps its text under a `## Superseded
// handoff` heading, which is not the handoff heading, so the finalization gate sees exactly one. Every
// function is pure; reading and patching comments belongs to the callers.
import { readHandoffMatrix } from "./handoff-matrix.mjs";

const HANDOFF_HEADING = "## Implementation handoff";
const SUPERSEDED_HEADING = "## Superseded handoff";
const SHORT_SHA_LENGTH = 7;
const LINE_BREAK = /\r?\n/;

function headingLine(body) {
  return String(body ?? "")
    .trimStart()
    .split(LINE_BREAK, 1)[0]
    .trimEnd();
}

function isHandoff(comment) {
  return headingLine(comment?.body) === HANDOFF_HEADING;
}

function isBy(comment, author) {
  return String(comment.user?.login).toLowerCase() === author.toLowerCase();
}

function newestFirst(left, right) {
  const byTime = Date.parse(right.created_at) - Date.parse(left.created_at);
  return byTime === 0 ? right.id - left.id : byTime;
}

// The first matrix row's head, shortened, or "unknown" when the matrix has none.
function headOf(body) {
  const head = readHandoffMatrix(body).rows?.[0]?.headSha;
  return typeof head === "string" && head !== "" ? head.slice(0, SHORT_SHA_LENGTH) : "unknown";
}

function commentProblem(comment) {
  const usable = Number.isInteger(comment.id) && Number.isFinite(Date.parse(comment.created_at));
  return usable ? null : `handoff comment ${comment.id} has no numeric id or no created_at time`;
}

function supersededBody(comment, keep) {
  const rest = String(comment.body).trimStart().split(LINE_BREAK).slice(1).join("\n").replace(/^\n+/, "");
  const heading = `${SUPERSEDED_HEADING} (head ${headOf(comment.body)})`;
  const by = `the handoff comment at head ${headOf(keep.body)} (comment ${keep.id})`;
  return `${heading}\n\nSuperseded by ${by}. Kept for history only.\n\n${rest}`;
}

// Returns { keep, superseded: [{ id, body }], ignored: [id] } or { errors }. Only comments written by the
// author count: a handoff-headed comment by anyone else is data, listed in ignored and never edited.
// Nothing is planned when one of the author's handoff comments is malformed, because the demotion edits one.
function selectHandoff(comments, author) {
  const headed = (Array.isArray(comments) ? comments : []).filter(isHandoff);
  const own = headed.filter((comment) => isBy(comment, author));
  const ignored = headed.filter((comment) => !isBy(comment, author)).map((comment) => comment.id);
  if (own.length === 0) {
    return { errors: [`no comment by ${author} starts with the ${HANDOFF_HEADING} heading`] };
  }
  const errors = own.map(commentProblem).filter(Boolean);
  if (errors.length > 0) {
    return { errors };
  }
  const [keep, ...older] = [...own].sort(newestFirst);
  const superseded = older.map((comment) => ({ id: comment.id, body: supersededBody(comment, keep) }));
  return { keep: { id: keep.id }, superseded, ignored };
}

export { selectHandoff };

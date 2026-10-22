// The parked record: an issue comment that holds one queue root out of selection until its owner deletes
// the comment. The classifier reads it and goal-sdlc's park.mjs writes it, so both live on one definition.
// Every function is pure.
import { lines } from "./acceptance-criteria.mjs";

const PARKED_HEADING = "## Parked";
const PARKED_MARKER = "<!-- dod-guard-parked -->";
const PARKED_PREFIX = `${PARKED_HEADING}\n\n${PARKED_MARKER}`;
const NOT_STATED = "not stated";

// A comment is a parked record only when its body, with CRLF normalized to LF first, begins with the
// heading, a blank line, and the marker line, followed by a line break or the end of the body. A comment
// that quotes the marker anywhere else is never read as a record.
function isParkedRecord(comment) {
  const body = lines(comment?.body);
  return (
    body.startsWith(PARKED_PREFIX) && (body.length === PARKED_PREFIX.length || body[PARKED_PREFIX.length] === "\n")
  );
}

function fieldOf(body, pattern) {
  return pattern.exec(body)?.[1].trim() || NOT_STATED;
}

// Every parked record among the comments, in comment order. A record whose field lines are missing still
// parks the issue, with the field read as "not stated", so a damaged record never silently releases it.
function parkedRecords(comments) {
  return (Array.isArray(comments) ? comments : []).filter(isParkedRecord).map((comment) => {
    const body = lines(comment.body);
    return {
      commentId: comment.id ?? null,
      blocked: fieldOf(body, /^Blocked: (.+)$/mu),
      unblocksWhen: fieldOf(body, /^Unblocks when: (.+)$/mu),
    };
  });
}

function renderParkedRecord({ blocked, unblocksWhen }) {
  return [PARKED_PREFIX, "", `Blocked: ${blocked}`, `Unblocks when: ${unblocksWhen}`].join("\n");
}

export { parkedRecords, renderParkedRecord };

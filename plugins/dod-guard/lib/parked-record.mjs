// The parked record: an issue comment that holds one queue root out of selection until its owner deletes
// the comment. The classifier reads it and goal-sdlc's park.mjs writes it, so both live on one definition.
// Every function is pure.
import { lines } from "./acceptance-criteria.mjs";
import { isRecordComment, recordPrefix } from "./comment-record.mjs";

const PARKED_KIND = Object.freeze({ heading: "## Parked", marker: "<!-- dod-guard-parked -->" });
const NOT_STATED = "not stated";
// Only a comment by someone with write-level standing on the repository can park a root, so a stranger's
// comment never holds the queue. A comment that does not state its author association is not trusted.
const TRUSTED_AUTHORS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function isParkedRecord(comment) {
  return TRUSTED_AUTHORS.has(comment?.author_association) && isRecordComment(comment, PARKED_KIND);
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
  return [recordPrefix(PARKED_KIND), "", `Blocked: ${blocked}`, `Unblocks when: ${unblocksWhen}`].join("\n");
}

export { parkedRecords, renderParkedRecord };

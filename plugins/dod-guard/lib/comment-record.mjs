// The one definition of what makes an issue comment a record. Closure records and the parked record both
// render a heading, a blank line, and a marker line, so both read a comment through this module.
import { lines } from "./acceptance-criteria.mjs";

function recordPrefix({ heading, marker }) {
  return `${heading}\n\n${marker}`;
}

// A comment is a record only when its body, with CRLF normalized to LF first, begins with the heading line,
// a blank line, and the marker line, followed by a line break or the end of the body: the shape the
// renderers write. A comment that quotes a marker anywhere else (a handoff, a review) is not a record, so
// no caller edits, counts, or parses it.
function isRecordComment(comment, kind) {
  const prefix = recordPrefix(kind);
  const body = lines(comment?.body);
  if (!body.startsWith(prefix)) return false;
  const rest = body.slice(prefix.length);
  return rest === "" || rest.startsWith("\n");
}

export { isRecordComment, recordPrefix };

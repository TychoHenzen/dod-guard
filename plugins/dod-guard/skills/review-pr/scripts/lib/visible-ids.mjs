// Puts each posted inline review comment's own GH-<id> in its body, so the id the report prints is also
// visible on GitHub. The id is the comment id, which exists only after the post, so this is an edit.

const labelOf = (comment) => `GH-${comment.id}`;

// A comment as it reads after the id edit, with the widest id a comment can
// have, so a size check made before the post also holds after the edit.
function widestLabelled(body) {
  return `${body.trimEnd()}\n\n${labelOf({ id: Number.MAX_SAFE_INTEGER })}`;
}

function lastLine(body) {
  return body.trimEnd().split("\n").at(-1);
}

// The edits still owed: top-level comments of this review whose body does not already end with their own id.
function visibleIdEdits(reviewId, reviewComments) {
  return reviewComments
    .filter((comment) => comment.pull_request_review_id === reviewId && !comment.in_reply_to_id)
    .filter((comment) => lastLine(comment.body) !== labelOf(comment))
    .map((comment) => ({ id: comment.id, body: `${comment.body.trimEnd()}\n\n${labelOf(comment)}` }));
}

export { visibleIdEdits, widestLabelled };

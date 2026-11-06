// The closure snapshot lists open pull requests that no Issue item links. The
// report must survive a snapshot written before that key existed, and a
// malformed entry must not stop the rest of the list from reporting.

function isPullEntry(entry) {
  return typeof entry === "object" && entry !== null && Number.isInteger(entry.number) && entry.number > 0;
}

function headOf(headRef) {
  return typeof headRef === "string" && headRef !== "" ? headRef : null;
}

export function unlinkedPullRequestsOf(snapshot) {
  if (!Array.isArray(snapshot?.unlinkedPullRequests)) {
    return [];
  }
  return snapshot.unlinkedPullRequests.filter(isPullEntry).map(({ number, headRef }) => ({
    number,
    headRef: headOf(headRef),
  }));
}

export function unlinkedReason({ number, headRef }) {
  const head = headRef ? ` (head ${headRef})` : "";
  return `open pull request #${number}${head} is linked to no Project issue`;
}

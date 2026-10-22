// The help text select-next.mjs prints when it gets no snapshot file.
export const USAGE = `usage: select-next.mjs --snapshot=<file.json>

The snapshot is one JSON object:
  repository      "owner/name" of the target repository
  defaultBranch   the repository's default branch
  today           optional local date (YYYY-MM-DD) for friction-log holds
  items           every Project item from every page, each with fields
                  Status, Repository, Parent issue, and Linked pull requests
  issues          every listed issue, with number, state, title, parent,
                  children (an empty array when it has none), blockedBy
                  ([{repository, number, state}], empty when nothing blocks
                  it), body (the issue body text), comments ([{id, body}],
                  empty when it has none), and activeCheckpoint (true while
                  its delivery checkpoint is open, false once it is finished)
  pullRequests    every linked pull request, with number, state, mergedAt,
                  head {repository, ref, sha}, base {ref, sha}, mergeCommit,
                  requiredChecks, and trustedHeadSha (the head SHA its
                  /complete-pr run verified)
  branches        optional; every pushed codex/ branch as {name,
                  openPullRequest}, true when an open pull request of the
                  repository has it as its head. A snapshot without the key
                  holds nothing.

A merged delivery counts as complete only with activeCheckpoint false on
every issue and trustedHeadSha equal to head.sha; otherwise it is held.

Every item, issue, pull request, and parent, child, or linked pull request
reference names its repository as owner/name.
Records from another repository are ignored.
A relation that leaves the repository holds its issue, with a reason naming
owner/name#N.
A record with no repository, a record with no number, a duplicated record, an
item whose issue is missing, or a linked pull request that is missing selects
nothing and is named in missingEvidence.
today defaults to the local date.

A Backlog ancestor with no delivery PR or active checkpoint and refined
Todo/In Progress children is a hierarchy. Its children are independent
delivery roots; their own nested checklist children stay together. Completed
siblings do not block unfinished roots, and unsafe ancestor relations hold
the descendant roots. A Todo or Backlog group whose issue has an open
blocker outside the group is held and names the blocker; Project order is
only the selector's default ranking.
A root with a parked record (an issue comment headed ## Parked, written by
park.mjs) is held in every status, with the record's lines in its reason,
until the comment is deleted.
A Todo or Backlog root with a branch named codex/<issue>-... whose
openPullRequest is not true is an unfinished delivery. It is held with the
branch named in its reason, and while any root is held that way no Todo or
Backlog group is selected. An In Progress group still resumes.
A Todo root whose body has a missing or unreadable refinement record, or
acceptance ids that disagree with its checkboxes, is reported with kind
needs-refinement and its reasons. It is never selected; run
/refine-backlog-item on it, which leaves its Status as Todo.
queueState is ready, held, or exhausted. A null selection with held work is
not an exhausted queue.`;

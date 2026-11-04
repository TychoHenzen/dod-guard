# fix-pr-review regression fixtures

These are manual behavioral fixtures for the instruction-only skill. They do not test a runtime classifier. Each case gives a situation and the expected result.

## Shared setup

The PR has parent PBI #10, sibling sub-issue #12 (open) and Backlog issue #20 (open), head SHA abc1234, and findings GH-1 to GH-8 sit in open threads unless the case says otherwise.

## Cases

| Case | Name | Situation | Expected result |
| --- | --- | --- | --- |
| 1 | unsupported decline | GH-1 conflicts with the PBI. No fix is needed. | Classified `unsupported`, no edit, one reply naming the classification, path and line evidence and head abc1234, then one resolveReviewThread and a readback. complete-pr no longer stops on this thread. |
| 2 | already-fixed decline | GH-2 claims a missing null check that current code has. | Classified `already-fixed`, one evidence reply with the head SHA, then resolve. |
| 3 | stale already resolved | GH-3 selects a thread that is already resolved. | Skipped with evidence, no reply, no mutation. |
| 4 | partial with destination | GH-4 holds, this batch fixes the validation half, the caller names #12 for the rest. | Classified `partial`. Fix pushed and converged first. Marker comment posted on #12 and read back, then a thread reply with the #12 comment link, the fixed part with commit and command, the remainder and head SHA, then resolve. |
| 5 | out-of-slice with destination | GH-5 holds but needs work outside the PBI's acceptance criteria, caller names #20. | Classified `out-of-slice`, no edit, marker comment on #20, thread reply with the link and the criteria it falls outside and who named the destination, then resolve. |
| 6 | out-of-slice without destination | GH-6 holds, the caller names nothing, and #12 and #20 both cover the remainder. | No unique match, so unrouted. No destination comment, thread left open, report line `unrouted: GH-6`. |
| 7 | destination closed by this PR | GH-7 names parent #10, which the PR closes. | Rejected as a destination, finding unrouted, thread left open. |
| 8 | rerun after a partial write | GH-4 comment on #12 exists with the marker but the thread reply failed. | The marker search finds the comment, no second comment is posted, the thread reply is posted once, then readback and resolve. |
| 9 | partial without destination | GH-8 holds, this batch fixes part, no destination is named or unique. | The fixed part is pushed, the thread stays open, report `unrouted: GH-8`. |
| 10 | rerun with both writes present, thread resolved | GH-4 comment on #12 and the thread reply both exist with the marker, and the thread is already resolved. | No-op: no comment, no reply, no mutation. |
| 11 | rerun with both writes present, thread open | GH-4 comment on #12 and the thread reply both exist with the marker, and the thread is open. | The marker is found in both places, so neither write is repeated. Readback, then one resolveReviewThread and a readback. |
| 12 | rerun after the destination closed | GH-4 comment on #12 exists with the marker, the thread reply failed, and #12 has since closed. | #12 holds the marker comment, so it stays valid. No second comment, the thread reply is posted once, then readback and resolve. |
| 13 | closed destination before any write | GH-5 names #12, which is closed, and no marker comment exists on it. | Rejected as a destination before the first write, finding unrouted, thread left open. |
| 14 | thread resolved between writes | GH-4 comment on #12 exists with the marker and the thread was resolved by hand before the reply. | The thread is resolved, so it is a no-op: no thread reply and no mutation. The existing destination comment stays. |
| 15 | sibling and Backlog both match | GH-6 holds, the caller names nothing, and sibling #12 and Backlog #20 both cover the remainder. | Neither has precedence, so no unique match: unrouted, thread left open. |

Each case follows the budget and stops of 'Update proven findings' in SKILL.md.

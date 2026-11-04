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

Each case follows the budget and stops of 'Update proven findings' in SKILL.md.

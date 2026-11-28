# Skill trigger eval results

Claude Code 2.1.331, model claude-opus-5-5, first run started 2026-11-28T07:29:00.270Z, 4 result file(s), $24.13 in total.

| Case | With plugin | Baseline | Delta | Graders: passing runs with plugin (baseline) |
|---|---|---|---|---|
| codex-migrate--agents-md | 1.00 | 0.00 | +1.00 | fires-codex-migrate 3/3 (baseline 0/3) |
| codex-migrate--share-instructions | 1.00 | 0.00 | +1.00 | fires-codex-migrate 3/3 (baseline 0/3) |
| complete-pr--finish-and-cleanup | 1.00 | 0.00 | +1.00 | fires-complete-pr 3/3 (baseline 0/3) |
| complete-pr--land-it | 1.00 | 0.00 | +1.00 | fires-complete-pr 3/3 (baseline 0/3) |
| complete-pr--merge-green | 1.00 | 0.00 | +1.00 | fires-complete-pr 3/3 (baseline 0/3) |
| complete-pr--not-for-review-pr | 1.00 | 1.00 | 0.00 | indicator-review-pr 0/3 (baseline n/a); not-complete-pr 3/3 (baseline 3/3) |
| complete-pr--not-for-submit-draft-pr | 1.00 | 1.00 | 0.00 | indicator-submit-draft-pr 3/3 (baseline n/a); not-complete-pr 3/3 (baseline 3/3) |
| control--unrelated-question | 1.00 | 1.00 | 0.00 | no-busy-skill 3/3 (baseline 3/3) |
| learn-repository--pick-a-concept | 1.00 | 0.00 | +1.00 | fires-learn-repository 3/3 (baseline 0/3) |
| learn-repository--teach-me | 1.00 | 0.00 | +1.00 | fires-learn-repository 3/3 (baseline 0/3) |
| next-ticket--continue-after-break | 1.00 | 0.00 | +1.00 | fires-next-ticket 3/3 (baseline 0/3) |
| next-ticket--grab-top-todo | 1.00 | 0.00 | +1.00 | fires-next-ticket 3/3 (baseline 0/3) |
| next-ticket--not-for-goal-sdlc | 1.00 | 1.00 | 0.00 | indicator-goal-sdlc 3/3 (baseline n/a); not-next-ticket 3/3 (baseline 3/3) |
| next-ticket--not-for-quick-pbi | 1.00 | 1.00 | 0.00 | indicator-quick-pbi 3/3 (baseline n/a); not-next-ticket 3/3 (baseline 3/3) |
| next-ticket--pickup-refined | 1.00 | 0.00 | +1.00 | fires-next-ticket 3/3 (baseline 0/3) |
| refine-backlog-item--estimate-and-prioritize | 1.00 | 0.00 | +1.00 | fires-refine-backlog-item 3/3 (baseline 0/3) |
| refine-backlog-item--groom-and-label | 1.00 | 0.00 | +1.00 | fires-refine-backlog-item 3/3 (baseline 0/3) |
| refine-backlog-item--not-for-add-backlog-idea | 1.00 | 1.00 | 0.00 | indicator-add-backlog-idea 3/3 (baseline n/a); not-refine-backlog-item 3/3 (baseline 3/3) |
| refine-backlog-item--not-for-next-ticket | 1.00 | 1.00 | 0.00 | indicator-next-ticket 3/3 (baseline n/a); not-refine-backlog-item 3/3 (baseline 3/3) |
| refine-backlog-item--refine-for-pickup | 1.00 | 0.00 | +1.00 | fires-refine-backlog-item 3/3 (baseline 0/3) |
| review-pr--before-merge | 0.00 | 0.00 | 0.00 | fires-review-pr 0/3 (baseline 0/3) |
| review-pr--not-for-fix-pr-review | 1.00 | 1.00 | 0.00 | indicator-fix-pr-review 3/3 (baseline n/a); not-review-pr 3/3 (baseline 3/3) |
| review-pr--post-findings | 1.00 | 0.00 | +1.00 | fires-review-pr 3/3 (baseline 0/3) |
| review-pr--review-by-url | 0.33 | 0.00 | +0.33 | fires-review-pr 1/3 (baseline 0/3) |
| submit-draft-pr--not-for-complete-pr | 1.00 | 1.00 | 0.00 | indicator-complete-pr 3/3 (baseline n/a); not-submit-draft-pr 3/3 (baseline 3/3) |
| submit-draft-pr--open-draft | 1.00 | 0.00 | +1.00 | fires-submit-draft-pr 3/3 (baseline 0/3) |
| submit-draft-pr--ready-for-review | 1.00 | 0.00 | +1.00 | fires-submit-draft-pr 3/3 (baseline 0/3) |
| submit-draft-pr--refresh-description | 1.00 | 0.00 | +1.00 | fires-submit-draft-pr 3/3 (baseline 0/3) |
| teach-back--check-understanding | 1.00 | 0.00 | +1.00 | fires-teach-back 3/3 (baseline 0/3) |
| teach-back--quiz-me | 1.00 | 0.00 | +1.00 | fires-teach-back 3/3 (baseline 0/3) |
| usability-review--error-state | 1.00 | 0.00 | +1.00 | fires-usability-review 3/3 (baseline 0/3) |
| usability-review--settings-screen | 1.00 | 0.00 | +1.00 | fires-usability-review 3/3 (baseline 0/3) |
| wiring-audit--reachable-feature | 1.00 | 0.00 | +1.00 | fires-wiring-audit 3/3 (baseline 0/3) |
| wiring-audit--retry-option | 1.00 | 0.00 | +1.00 | fires-wiring-audit 3/3 (baseline 0/3) |

## Implementation handoff

- T1 (parent-level convergence): commit 61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b, files plugins/dod-guard/lib/preflight-checkpoint.mjs, plugins/dod-guard/lib/preflight-checkpoint.test.mjs, plugins/dod-guard/skills/next-ticket/SKILL.md, plugins/dod-guard/skills/next-ticket/scripts/handoff-build.mjs, plugins/dod-guard/skills/next-ticket/scripts/handoff-build.test.mjs, plugins/dod-guard/skills/next-ticket/scripts/handoff-comment.mjs, plugins/dod-guard/standards/project-workflow.md, evidence ev-t1-change, ev-lens-implementation, result node --test handoff-build.test.mjs and preflight-checkpoint.test.mjs: 34 pass, 0 fail. The new checkpointSection tests failed before the change (module link error on the missing export), then passed after it. Test constants and Biome annotations only at 61e56b6e, no behavior change.
- T2 (parent-level convergence): commit 61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b, files plugins/dod-guard/skills/fix-pr-review/SKILL.md, plugins/dod-guard/skills/next-ticket/scripts/handoff-build.test.mjs, evidence ev-t2-change, ev-lens-wiring, result node --test handoff-build.test.mjs: 18 pass, 0 fail, including the finalization rebind test (rebuilt handoff with rows rewritten at the new head returns outcome verified, remainder empty). Grep finds '## Rebind the handoff' and '--previous-handoff-file' in fix-pr-review SKILL.md. Test constants and Biome annotations only at 61e56b6e, no behavior change.
- T3 (parent-level convergence): commit 61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b, files plugins/dod-guard/skills/complete-pr/scripts/lib/closure-plan.mjs, plugins/dod-guard/skills/complete-pr/scripts/lib/closure-plan.test.mjs, plugins/dod-guard/skills/complete-pr/scripts/lib/closure-apply.mjs, plugins/dod-guard/skills/complete-pr/scripts/lib/closure-apply.test.mjs, plugins/dod-guard/USAGE.md, plugins/dod-guard/standards/project-workflow.md, plugins/dod-guard/skills/complete-pr/scripts/lib/closure-apply.record.test.mjs, plugins/dod-guard/skills/complete-pr/scripts/lib/closure-plan.repair.test.mjs, evidence ev-t3-change, ev-lens-reliability, result closure-plan, closure-apply and closure.round-trip tests: 42 pass, 0 fail. Line-width repair in ae464af0a (three added lines wrapped to 120 columns, no wording change). Test constants and Biome annotations only at 61e56b6e, no behavior change.
- T4 (parent-level convergence): commit 61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b, files plugins/dod-guard/agents/stage-standard.md, plugins/dod-guard/agents/stage-cheap-skill.md, .codex/agents/dod_guard_stage_standard.toml, .codex/agents/dod_guard_stage_cheap_skill.toml, plugins/dod-guard/skills/goal-sdlc/scripts/model-routing.test.mjs, evidence ev-t4-change, result model-routing.test.mjs: 7 pass, 0 fail. convert-claude-agents.mjs --check: Codex agents current. validate-plugins: OK.
- T5 (parent-level convergence): commit 61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b, files none changed by T5; the gates ran over the 18 files listed by git diff --stat master...HEAD, evidence ev-t5-change, ev-lens-quality, result test:dod-guard-skills 1417 pass, 0 fail, 1 skipped; test:ci-scripts 77 pass, 0 fail. preflight:static-analysis passed; validate-plugins OK; convert-claude-agents --check exit 0, all re-run at 9a3c5444. Re-run at 61e56b6e after the Biome fix: test:dod-guard-skills 1417 pass, 0 fail, 1 skipped; test:ci-scripts 77 pass, 0 fail; preflight:static-analysis passed; validate-plugins OK; convert-claude-agents --check exit 0.

## Acceptance matrix

```json
[
  {
    "id": "R1",
    "contract": "AC-1",
    "path": "checkpoint-carry",
    "proof": "proof-ac1",
    "expected": "checkpoint-carry behaves as planned",
    "observed": "AC-1: handoff-build --previous-handoff-file carries the previous Preflight checkpoint unchanged to the end of the rebuilt comment; output is unchanged when the option is absent; two checkpoint sections in the previous handoff are refused with exit 1. Proven by the T1 tests at 5b5afd22 (34 pass). Re-observed at 9a3c5444: preflight-checkpoint, handoff-build and handoff-comment tests pass (included in test:dod-guard-skills 1417 pass, 0 fail, 1 skipped). Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-ac1",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R2",
    "contract": "AC-2",
    "path": "fix-pr-review-rebind",
    "proof": "proof-ac2",
    "expected": "fix-pr-review-rebind behaves as planned",
    "observed": "AC-2 at file level: fix-pr-review SKILL.md has the Rebind the handoff section (rebuild with --previous-handoff-file, PATCH the one comment, wait for terminal required contexts, rewrite rows, run finalization). The finalization test passes at 87e6e3b8 (outcome verified, remainder empty). The live owner confirmation after merge (a fix-pr-review run on a structured PR, then complete-pr with no resubmission) is NOT part of this row and is listed as a post-merge remainder in the handoff. Re-observed at 9a3c5444: the Rebind the handoff section now states the exit codes of handoff-build and the expected verified outcome of finalization with its stop branches; the finalization test still passes. Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-ac2",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R3",
    "contract": "AC-3",
    "path": "not-planned-done-repair",
    "proof": "proof-ac3",
    "expected": "not-planned-done-repair behaves as planned",
    "observed": "AC-3: closure-plan tests list a Done repair with stateReason not_planned for Backlog and In Progress not_planned closes, including a close named by a supersedes root and an unverified root; none for a Done item or a completed close. closure-apply tests: apply writes Done with readback, stops with 'no longer closed as not_planned' when the live issue changed, and a replan after apply lists no repair. 42 pass at 770d3f7c and ae464af0. Re-observed at 9a3c5444: closure-plan, closure-plan.repair and closure-apply tests pass after the recheck moved into assertStillClosed and repairDone. Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-ac3",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R4",
    "contract": "AC-4",
    "path": "repair-docs",
    "proof": "proof-ac4",
    "expected": "repair-docs behaves as planned",
    "observed": "AC-4: Grep finds 'owes no delivery' in USAGE.md (line 87) and in project-workflow.md (line 390), and 'sets its Project item to Done' in USAGE.md (line 86). The old not-reported wording in project-workflow.md now sits before the added Done clause, which follows it in the same paragraph. Re-observed at 9a3c5444: USAGE.md and project-workflow.md rewrapped, no wording change in the Done repair claim. Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-ac4",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R5",
    "contract": "AC-5",
    "path": "progress-note-rule",
    "proof": "proof-ac5",
    "expected": "progress-note-rule behaves as planned",
    "observed": "AC-5 at file level: both stage-standard.md and stage-cheap-skill.md carry the 15-minute progress-note rule. stage-cheap.md is not in the diff. The two .codex/agents tomls are regenerated and convert-claude-agents --check exits 0. model-routing.test.mjs pins the rule (7 pass). The live check (a submit-draft-pr stage running longer than 15 minutes that sends a note at each interval) was NOT run and is listed as a remainder in the handoff. Re-observed at 9a3c5444: model-routing.test.mjs pins hoisted to top-level constants, same pins, tests pass. Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-ac5",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R6",
    "contract": "AC-6",
    "path": "quality",
    "proof": "proof-ac6",
    "expected": "quality behaves as planned",
    "observed": "AC-6: npm run test:dod-guard-skills 1417 pass, 0 fail (1 skipped); npm run test:ci-scripts 77 pass, 0 fail; npm run preflight:static-analysis passed (Biome reports 200 lint warnings in packages and tools paths, none in a changed file; the strict gate fails only on error-level diagnostics); validate-plugins OK; convert-claude-agents --check exit 0. Re-observed at 9a3c5444: test:dod-guard-skills 1417 pass, 0 fail, 1 skipped; test:ci-scripts 77 pass, 0 fail. preflight:static-analysis passed; validate-plugins OK; convert-claude-agents --check exit 0. Re-observed at 61e56b6e: test:dod-guard-skills 1417 pass, 0 fail, 1 skipped; test:ci-scripts 77 pass, 0 fail; preflight:static-analysis passed; validate-plugins OK; convert-claude-agents --check exit 0. Biome warnings on the 11 changed script files, measured the same way on both sides (biome check with the repo biome.json over the same file list, base exported with git archive): 120 at base e635825, 85 at head 61e56b6e, so the head count is no higher than base; 0 warnings on lines this PR added.",
    "status": "pass",
    "evidence": "ev-ac6",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R7",
    "contract": "AC-6",
    "path": "identity/authorization",
    "proof": "proof-path-identity",
    "expected": "inapplicable",
    "observed": "No credential is read or written. The Done repair and the handoff comment update use the gh login already in use.",
    "status": "inapplicable",
    "evidence": "ev-path-identity",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b",
    "reason": "no credential is read or written; the Done repair and the comment update use the gh login already in use"
  },
  {
    "id": "R8",
    "contract": "AC-2",
    "path": "interactive-control",
    "proof": "proof-path-interactive-control",
    "expected": "interactive-control behaves as planned",
    "observed": "No interactive control surface exists in this change: the work is a CLI option, a SKILL.md section, and a closure plan with its apply step.",
    "status": "inapplicable",
    "evidence": "ev-path-interactive-control",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b",
    "reason": "no interactive control surface; the change is a CLI option, a SKILL.md section and a closure plan, and the owner's live fix-pr-review run is the post-merge remainder"
  },
  {
    "id": "R9",
    "contract": "AC-2",
    "path": "browser/e2e",
    "proof": "proof-path-browser-e2e",
    "expected": "inapplicable",
    "observed": "No browser surface. The handoff-build command line and the fix-pr-review SKILL.md section are the user path.",
    "status": "inapplicable",
    "evidence": "ev-path-browser-e2e",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b",
    "reason": "no browser surface; the handoff-build command line and the fix-pr-review SKILL.md section are the user path"
  },
  {
    "id": "R10",
    "contract": "AC-3",
    "path": "data/error",
    "proof": "proof-path-data-error",
    "expected": "data/error behaves as planned",
    "observed": "Data and error paths: an unverified-closed not_planned original keeps its report while getting a Done repair; apply stops when the live issue is no longer closed as not_planned and leaves the Project item not Done; handoff-build refuses two checkpoint sections in the previous handoff with exit 1 and a bare --previous-handoff-file with a usage error. All pass at 770d3f7c, ae464af0 and 5b5afd22. Re-observed at 9a3c5444: the not_planned stop and the handoff-build refusals still pass in the split test files. Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-path-data-error",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  },
  {
    "id": "R11",
    "contract": "AC-3",
    "path": "recovery",
    "proof": "proof-path-recovery",
    "expected": "recovery behaves as planned",
    "observed": "Recovery path: after apply sets Done for a not_planned hand close, a fresh plan lists no repair; a stale-live stop leaves the Project item untouched so the next run can finish it. Proven by the apply and replan tests at 770d3f7c (42 pass). Re-observed at 9a3c5444: the apply and replan recovery tests still pass in closure-apply.test.mjs. Re-observed at 61e56b6e: only test constants, biome-ignore notes and one ternary changed; test:dod-guard-skills 1417 pass, 0 fail.",
    "status": "pass",
    "evidence": "ev-path-recovery",
    "headSha": "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b"
  }
]
```

Remainder:

1. Live check for AC-2, after merge: the owner runs fix-pr-review on a structured PR, then complete-pr with no resubmission. Not run. Row R2 covers the file-level criterion only.
2. Live check for AC-5, not run: a submit-draft-pr stage that runs longer than 15 minutes sends the dispatcher one progress note per interval. Row R5 covers the file-level criterion only.
3. Friction log entry 2 is out of scope and not implemented. Whether the PR says Closes #1115 or only references it is the owner's decision.
4. Attribution: the earlier commits end with the Co-Authored-By line for Claude Haiku 5.5 and the review-fix commits with Claude Opus 5.5, as each brief required.

## Preflight checkpoint

- Base: master at e635825437e4ae60bc7e1327f153d2d7e325b93a (unchanged at readback)
- Mergeability at readback: mergeable true, mergeable_state clean
- Head: 61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b (ls-remote, PR API head and refs/pull/1117/head agree)
- Draft PR: https://github.com/TychoHenzen/dod-guard/pull/1117
- Required contexts read back from ci run 41270763638 (conclusion success) at this head

```json
[
  {"context":"build-test","provider":"github-actions","workflow":"ci","runId":41270763638,"branchRef":"refs/heads/codex/1115-friction-log-2026-11-01","headSha":"61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b","state":"present"},
  {"context":"plugin-config","provider":"github-actions","workflow":"ci","runId":41270763638,"branchRef":"refs/heads/codex/1115-friction-log-2026-11-01","headSha":"61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b","state":"present"},
  {"context":"static-analysis","provider":"github-actions","workflow":"ci","runId":41270763638,"branchRef":"refs/heads/codex/1115-friction-log-2026-11-01","headSha":"61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b","state":"present"},
  {"context":"package-integrity","provider":"github-actions","workflow":"ci","runId":41270763638,"branchRef":"refs/heads/codex/1115-friction-log-2026-11-01","headSha":"61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b","state":"present"},
  {"context":"quality-guard","provider":"github-actions","workflow":"ci","runId":41270763638,"branchRef":"refs/heads/codex/1115-friction-log-2026-11-01","headSha":"61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b","state":"present"}
]
```

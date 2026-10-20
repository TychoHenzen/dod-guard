## Outcome

A minimal fixture with the record shape of TychoHenzen/dod-guard#855 after its hand correction. It is test data for `handoff-proof.mjs refinement`, not a real PBI.

This is the corrected form: T1 declares the recovery row R9, and the reliability lens cites it.

## Implementation notes

### requirements

- Archived Project items stay out of the closure snapshot.
- Unclaimed owner closes are not reported as unverified.

### clarifications

- No open decision.

### implementation-plan

- T1 owns the snapshot change, T2 the plan change, T3 the record backfill and the documentation.

### task-list

```json
[
  {"id":"T1","title":"T1 task","parentLevel":"convergence","evidence":["ev-t1-change","ev-lens-reliability"],"acceptanceEvidence":["ev-ac1-archived","ev-path-data-error","ev-ac1-recovery"],"verificationEvidence":["proof-ac1-archived","proof-path-data-error","proof-ac1-recovery"]},
  {"id":"T2","title":"T2 task","parentLevel":"convergence","evidence":["ev-t2-change","ev-lens-implementation"],"acceptanceEvidence":["ev-ac2-unclaimed"],"verificationEvidence":["proof-ac2-unclaimed"]},
  {"id":"T3","title":"T3 task","parentLevel":"convergence","evidence":["ev-t3-change","ev-lens-wiring","ev-lens-quality"],"acceptanceEvidence":["ev-path-identity","ev-path-interactive-control","ev-path-browser-e2e","ev-path-recovery","ev-ac3-quality"],"verificationEvidence":["proof-path-identity","proof-path-interactive-control","proof-path-browser-e2e","proof-path-recovery","proof-ac3-quality"]}
]
```

### lens-ownership

```json
[
  {"id":"implementation","owner":"T2","evidence":["ev-lens-implementation"],"acceptanceEvidence":["ev-ac2-unclaimed"],"verificationEvidence":["proof-ac2-unclaimed"]},
  {"id":"wiring/usability","owner":"T3","evidence":["ev-lens-wiring"],"acceptanceEvidence":["ev-path-interactive-control","ev-path-browser-e2e"],"verificationEvidence":["proof-path-interactive-control","proof-path-browser-e2e"]},
  {"id":"quality","owner":"T3","evidence":["ev-lens-quality"],"acceptanceEvidence":["ev-ac3-quality"],"verificationEvidence":["proof-ac3-quality"]},
  {"id":"reliability","owner":"T1","evidence":["ev-lens-reliability"],"acceptanceEvidence":["ev-ac1-archived","ev-path-data-error","ev-ac1-recovery"],"verificationEvidence":["proof-ac1-archived","proof-path-data-error","proof-ac1-recovery"]}
]
```

### acceptance-evidence

```json
[
  {"id":"AC-1","evidence":"ac-1-observed"},
  {"id":"AC-2","evidence":"ac-2-observed"},
  {"id":"AC-3","evidence":"ac-3-observed"}
]
```

### planned-acceptance-matrix

```json
[
  {"id":"R1","contract":"AC-1","path":"archived-items","proof":"proof-ac1-archived","evidence":"ev-ac1-archived","expected":"archived-items behaves as planned","status":"pending"},
  {"id":"R2","contract":"AC-2","path":"unclaimed-closes","proof":"proof-ac2-unclaimed","evidence":"ev-ac2-unclaimed","expected":"unclaimed-closes behaves as planned","status":"pending"},
  {"id":"R3","contract":"AC-3","path":"identity/authorization","proof":"proof-path-identity","evidence":"ev-path-identity","expected":"inapplicable","status":"inapplicable","reason":"no credential is read"},
  {"id":"R4","contract":"AC-3","path":"interactive-control","proof":"proof-path-interactive-control","evidence":"ev-path-interactive-control","expected":"interactive-control behaves as planned","status":"pending"},
  {"id":"R5","contract":"AC-3","path":"browser/e2e","proof":"proof-path-browser-e2e","evidence":"ev-path-browser-e2e","expected":"inapplicable","status":"inapplicable","reason":"no browser surface"},
  {"id":"R6","contract":"AC-1","path":"data/error","proof":"proof-path-data-error","evidence":"ev-path-data-error","expected":"data/error behaves as planned","status":"pending"},
  {"id":"R7","contract":"AC-3","path":"recovery","proof":"proof-path-recovery","evidence":"ev-path-recovery","expected":"recovery behaves as planned","status":"pending"},
  {"id":"R8","contract":"AC-3","path":"quality","proof":"proof-ac3-quality","evidence":"ev-ac3-quality","expected":"quality behaves as planned","status":"pending"},
  {"id":"R9","contract":"AC-1","path":"recovery","proof":"proof-ac1-recovery","evidence":"ev-ac1-recovery","expected":"recovery behaves as planned","status":"pending"}
]
```

## Acceptance criteria

- [ ] AC-1 The closure snapshot leaves archived Project items out.
- [ ] AC-2 An owner's unclaimed not_planned close is not reported as unverified.
- [ ] AC-3 The supersedes records are backfilled and the report scope is documented.

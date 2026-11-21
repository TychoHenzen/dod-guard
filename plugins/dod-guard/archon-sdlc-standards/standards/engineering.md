## dod-guard engineering standards

These are the values the SDLC pack's implementer and reviewers judge a change by.
A review finding about taste cites one of these lines, or it is left out.

### Scope of a change

- Build what the work item's contract requires, and nothing it does not name. A helper, option or abstraction that no requirement uses is a defect.
- One pull request delivers one outcome. Work the contract does not name goes to a new issue, not into this change.

### Done means reachable

- A behavior is delivered when a user reaches it from the product's real entrypoint: the command, route, screen or public API the contract names. A unit test or an internal helper alone does not prove it.
- A user-facing control is proven by using it the way a user would: a browser, end-to-end or scripted-input test that drives that control.
- The error and recovery paths the contract implies are part of the outcome: malformed input, a failed dependency, an interrupted operation, and what the user sees after each.

### Tests

- Every behavior the change adds or alters has a test that fails without the change.
- Never weaken, skip or delete a test to make it pass. When a clear contract and a test disagree, update the stale expectation. When the code breaks the contract, fix the code.
- A failing check in a path the change touches, or in a required suite, belongs to the change, however old its cause. Fix it, or show evidence that it is unrelated and file an issue for it. "Pre-existing" alone is never a reason to leave it.
- Tests are flat and self-contained, in Arrange, Act, Assert order. A characterization test that only freezes today's output does not prove a requirement.
- A new test file sits where the project's test command finds it. A test that never runs proves nothing.

### Design

- Prefer small pure functions with explicit inputs and outputs, and keep I/O at the boundaries. An ordinary loop or a mutation is fine when it reads more clearly.
- Each responsibility has one owner. Names say what a thing does. A file sits with the code it serves.
- Prefer composition and passing dependencies in over hidden globals. Keep data separate from the behavior that acts on it, and keep state immutable where the language makes that cheap.
- No speculative abstraction. No old flow left beside the new one that replaces it. No compatibility adapter without a named caller that needs it.

### Reliability

- Trace failure paths, malformed and boundary inputs, concurrency and shared async state, cleanup, retries, resource use and performance.
- Check injection, authorization, secrets, unsafe deserialization and trust boundaries.
- A reliability finding names an observable failure at the reviewed head.

### Hygiene

- New code matches the code around it.
- A comment explains why. It never narrates what the next line does.
- Leave no dead code, duplicated path, debugging output, or unexplained non-obvious choice.
- Model-writing artifacts are defects: narrated comments, docstrings that restate the signature, placeholder text, and hedging prose.

### Severity

- A finding that breaks the contract, loses or corrupts data, or opens a security hole makes the change not ready.
- A defect in code the change adds or touches is the change's defect, even when the line was written earlier.
- A note that only offers a cleaner option, with no failure and no line above to cite, never on its own makes a change not ready.

### Git

- Never rebase or force-push a branch someone else may hold.
- Never merge past a failing required check, and never with an administrator override.

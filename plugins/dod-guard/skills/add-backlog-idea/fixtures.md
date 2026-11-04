# Context preservation fixture

| Input | Expected capture record |
| --- | --- |
| Two features share the constraint "preserve cited examples", feature A has decision "use existing issues", and a final supplied detail fits neither feature. | Both issues retain the shared constraint; A retains the supplied decision in `## Context`; show the final detail as an explicit unresolved remainder. With a user present, ask where it belongs inside the single batched round. When another skill invoked this one or no user is present, ask nothing and report it as the unresolved remainder for the caller to decide. |
| A user invokes the skill directly in an interactive session with "make exports better", which states no outcome. | One batched round: every question in one turn, 3 or 4 options each with the first marked (Recommended), an `Other` option, a Low/Medium/High label per question ordered High to Low, and a reply format. The answers are kept word for word under `## Context`; unanswered points go under `## Open questions`. No second round, and no codebase reading. |
| `dod-guard:quick-pbi` or `dod-guard:goal-sdlc` invokes the skill with the text "make exports better", or no user is present. | Nothing is asked. The issue is created with the text as `## Idea` and each open point under `## Open questions`. |

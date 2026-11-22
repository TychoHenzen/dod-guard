## Why

A player can draw past the seven-card hand limit, because the draw action checks the deck and not the hand. The rules engine and the hand view then disagree about which cards are playable.

## What Changes

- The draw action refuses a draw that would take the hand past seven cards.
- The hand view shows the limit and disables the draw button at the limit.

Capabilities:

- `card-rules` (new): the hand size limit on draws.
- `hand-view` (changed): the draw button state at the limit.

Non-goals:

- No change to the discard rules.
- No change to the starting hand size.

## Design

The limit lives in the rules engine, so the view reads it instead of keeping its own copy. The draw action returns a refusal reason, and the view disables the button from the same check.

## Implementation notes

### requirements

- R-1 (ADDED, card-rules) Hand size limit: The game SHALL reject a draw that would take the hand past seven cards.
- R-2 (ADDED, card-rules) Refusal reason: The draw action SHALL return the reason `hand-full` when it refuses a draw.
- R-3 (MODIFIED, hand-view) Draw button state: The hand view SHALL disable the draw button while the hand holds seven cards.

### task-list

```json
[
  {"id": "T1", "title": "Enforce the hand size limit in the draw action", "parentLevel": "convergence", "independent": false, "dependsOn": []},
  {"id": "T2", "title": "Disable the draw button at the limit", "parentLevel": "convergence", "independent": false, "dependsOn": ["T1"]}
]
```

## Acceptance criteria

- [ ] AC-1 (R-1) Draw below limit: WHEN the hand holds six cards and the player draws THEN the hand holds seven cards
- [ ] AC-2 (R-1, R-2) Draw at limit: WHEN the hand holds seven cards and the player draws THEN the draw is refused with the reason `hand-full`
- [ ] AC-3 (R-3) Button at limit: WHEN the hand holds seven cards THEN the draw button is disabled

## Verification

- AC-1 and AC-2: run the rules-engine draw tests.
- AC-3: run the hand-view test that fills the hand to seven cards.

## ADDED Requirements

### Requirement: The spec detail view shows an obligation delta per requirement

The spec detail view SHALL display an obligation delta chip next to each
requirement's existing bound/total coverage chip. The chip SHALL show the count
of uncovered obligations (obligation keywords minus scenario count). The chip
SHALL appear only when the delta is greater than zero.

#### Scenario: A requirement with positive obligation delta

- **WHEN** the spec detail view renders a requirement whose body has 5
  obligation keywords and 2 scenarios
- **THEN** the view shows a chip reading `3 uncovered` styled as a warning

#### Scenario: A requirement with zero or negative delta

- **WHEN** the spec detail view renders a requirement whose obligation count
  equals or is less than its scenario count
- **THEN** no obligation delta chip appears for that requirement

### Requirement: The spec detail API includes obligation counts per requirement

The spec detail endpoint SHALL include an `obligationCount` field on each
requirement alongside the existing scenario data. The field SHALL hold the
count of RFC 2119 obligation keywords in that requirement's body text.

#### Scenario: Spec detail response includes obligation counts

- **WHEN** a client requests the spec detail for a capability with two
  requirements, the first having 4 obligation keywords and the second having 1
- **THEN** the response includes `obligationCount: 4` on the first requirement
  and `obligationCount: 1` on the second

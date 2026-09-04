## MODIFIED Requirements

### Requirement: The spec detail API includes coverage bindings

The spec detail endpoint SHALL include a coverage map alongside the existing scenario data. The map SHALL be keyed by scenario id, and each entry SHALL carry the test file path and the test name. The spec detail endpoint SHALL also return the aggregate bound and total scenario counts so the sidebar can display them without re-counting.

#### Scenario: Spec detail response includes bindings
- **WHEN** a client requests the spec detail for a capability that has two scenarios, one bound and one not
- **THEN** the response includes a `coverage` object with one entry keyed by the bound scenario's id, carrying `testFile` and `testName`, and no entry for the unbound scenario

#### Scenario: Spec detail for a capability with no bindings
- **WHEN** a client requests the spec detail for a capability whose scenarios are all unbound
- **THEN** the response includes an empty `coverage` object

#### Scenario: Spec detail includes aggregate counts for sidebar use
- **WHEN** a client requests the spec detail for a capability with 6 scenarios, 4 bound
- **THEN** the response includes `boundCount: 4` and `totalCount: 6` alongside the coverage map

# Memory Bus Specification

## Purpose

Defines the cross-session record of what was tried and what worked in
gitevo. The bus persists messages, checkpoint timestamps, and branch state
in a SQLite database under `.evo/`. An evomcp reader on the other side of
the seam uses that database to recover past insights, past failures, and
elite solutions from earlier sessions.

## Requirements

### Requirement: Messages persist under .evo/ in a shared database
The system SHALL store every message in a SQLite database at
`.evo/memory.db`, creating the `.evo/` directory and the database file when
neither exists. The system SHALL reuse the same connection for repeated
calls made against the same working directory.

#### Scenario: First write in a fresh checkout
- **WHEN** a message is written and no `.evo/memory.db` exists yet
- **THEN** the system creates the `.evo/` directory and the database file
  before storing the message

#### Scenario: Repeated calls against the same directory
- **WHEN** two messages are written in the same working directory in the same
  process
- **THEN** both land in the same `.evo/memory.db` file

### Requirement: A message carries a type, scope, content, metadata, and branch
For every message, the system SHALL record a type, a content body, and a
timestamp of when it was written. It SHALL also record an optional scope,
optional metadata, and an optional branch. The system SHALL support at
least three message types: INSIGHT, FAILURE_SIGNATURE, and ELITE_SOLUTION.

#### Scenario: Insight recorded with no scope
- **WHEN** an INSIGHT message is written with no scope and no metadata
- **THEN** the system stores it with an empty scope and empty metadata,
  alongside its content and timestamp

#### Scenario: Failure signature recorded with a scope
- **WHEN** a FAILURE_SIGNATURE message is written with a scope naming the
  affected area
- **THEN** later queries filtered to that scope return the message

#### Scenario: Elite solution recorded with metadata
- **WHEN** an ELITE_SOLUTION message is written with metadata describing the
  win
- **THEN** the stored message returns that metadata intact on query

### Requirement: Messages are queryable by type and by scope
The system SHALL let a caller query messages filtered by type, by scope, by
a minimum timestamp, or by any combination of these. It SHALL return the
most recent matching messages first. The system SHALL cap the number of
messages returned, defaulting to 50 when the caller sets no limit.

#### Scenario: Query filtered by type
- **WHEN** a caller queries for type FAILURE_SIGNATURE
- **THEN** only FAILURE_SIGNATURE messages are returned, newest first

#### Scenario: Query filtered by type and scope together
- **WHEN** a caller queries for type ELITE_SOLUTION and a specific scope
- **THEN** only messages matching both the type and the scope are returned

#### Scenario: Query with no limit set
- **WHEN** more than 50 messages match a query and the caller sets no limit
- **THEN** the system returns the 50 most recent matches

### Requirement: Message counts are available overall and per type
The system SHALL report the total number of stored messages, and SHALL
report the count for a single named type when asked.

#### Scenario: Overall count
- **WHEN** a caller asks for the message count with no type given
- **THEN** the system returns the count of every stored message

#### Scenario: Count for one type
- **WHEN** a caller asks for the message count of type INSIGHT
- **THEN** the system returns only the count of INSIGHT messages

### Requirement: Branch records keep one row per branch with its current status
The system SHALL record a branch's name, status, and spawn point. It SHALL
keep exactly one record per branch name, updating that record's status in
place on every subsequent record for the same name.

#### Scenario: Recording the same branch twice
- **WHEN** a branch is recorded once as active and again later as dead
- **THEN** the branch's stored status reads dead, and no second row for that
  branch name exists

#### Scenario: Spawn point kept unless replaced
- **WHEN** a branch record with no spawn point given follows an earlier
  record that set one
- **THEN** the branch's stored spawn point stays unchanged

### Requirement: Checkpoint timestamps and a branch's spawn point are readable back
The system SHALL record a timestamp for every checkpoint tag, and SHALL let a
caller read back every checkpoint's timestamp. The system SHALL let a caller
look up the checkpoint tag a given branch was spawned from.

#### Scenario: Reading checkpoint timestamps
- **WHEN** several checkpoints have been recorded
- **THEN** a caller can read back the timestamp recorded for each tag

#### Scenario: Looking up a branch with no spawn record
- **WHEN** a caller looks up the spawn point of a branch that was never
  recorded with one
- **THEN** the system reports no spawn point for that branch

### Requirement: A store call never precedes or breaks the git effect it describes
The system SHALL run every memory bus write after the git operation it
describes has already completed. A memory bus call that cannot complete
SHALL NOT prevent the git operation it describes from having taken effect.

#### Scenario: Memory bus unavailable during a checkpoint
- **WHEN** a checkpoint's git tag has been created and the memory bus write
  describing it cannot complete
- **THEN** the checkpoint's git tag still exists

### Requirement: evomcp reads the memory bus this capability writes
The system SHALL expose message, checkpoint, and branch data in a form an
external reader can query without depending on gitevo's other operations.
This specification does not constrain what that reader does with the data.

#### Scenario: External read of stored messages
- **WHEN** an external reader queries the memory bus for FAILURE_SIGNATURE
  messages in a given scope
- **THEN** it receives the same messages this capability stored for that
  scope, independent of any branch or checkpoint operation

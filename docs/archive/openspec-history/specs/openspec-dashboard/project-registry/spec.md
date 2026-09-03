# OpenSpec Project Registry Specification

## Purpose

Decides which OpenSpec projects the dashboard shows, and how a reader finds
more of them. A scan proposes candidates and the registry decides what appears.
That split keeps the tab bar under the reader's control rather than under the
file system's.

## Requirements

### Requirement: The registry alone decides which projects appear

The dashboard SHALL show a project only when the registry lists it. A scan
SHALL NOT add a project on its own. Adding a project SHALL be an explicit act
by the reader.

#### Scenario: Scan finds an unregistered project
- **WHEN** a scan finds an `openspec/` directory the registry does not list
- **THEN** the path is offered as a candidate and no tab appears for it

#### Scenario: Reader adds a candidate
- **WHEN** the reader selects a candidate and confirms the addition
- **THEN** the registry gains that project and a tab appears for it

#### Scenario: Candidate is already registered
- **WHEN** a scan finds a path the registry already lists
- **THEN** the candidate is marked as registered and adding it again changes
  nothing

### Requirement: The registry survives a restart

The registry SHALL be stored as JSON in a fixed location under the user's home
directory, outside any project. Its contents SHALL be reloaded at startup.

#### Scenario: Added project after a restart
- **WHEN** a project is added and the dashboard is then stopped and started
- **THEN** the project still has a tab

#### Scenario: No registry file yet
- **WHEN** the dashboard starts and no registry file exists
- **THEN** it starts from a registry holding the current directory, if that
  directory holds an `openspec/` directory, and holding nothing otherwise

#### Scenario: Registry file will not parse
- **WHEN** the registry file holds content that is not valid JSON
- **THEN** the reader treats it as empty and the dashboard still starts

### Requirement: A scan searches bounded roots and reports candidates

A scan SHALL search only the configured roots, and SHALL stop at a bounded
depth below each one. It SHALL treat a directory holding an `openspec/` child
as a candidate. It SHALL NOT descend into a directory used for dependencies,
version control, or build output.

#### Scenario: Directory holds an openspec directory
- **WHEN** a searched directory holds a child named `openspec`
- **THEN** that directory is reported as a candidate and is not searched deeper

#### Scenario: Dependency and build directories
- **WHEN** the search reaches a directory named `node_modules`, `.git`, `dist`
  or `build`
- **THEN** it does not descend into it

#### Scenario: Depth bound reached
- **WHEN** a branch of the tree goes deeper than the bound
- **THEN** the search stops on that branch rather than walking the whole disk

#### Scenario: A configured root does not exist
- **WHEN** a configured root names a directory that is not present
- **THEN** the scan skips it and still reports candidates from the other roots

### Requirement: A registered project that has gone away is reported

The dashboard SHALL check that a registered project still holds an `openspec/`
directory. A project failing that check SHALL be shown as missing rather than
dropped from the registry. A missing project SHALL NOT stop the other projects
from loading.

#### Scenario: Registered path was deleted
- **WHEN** a registered project's directory no longer exists
- **THEN** its tab is marked missing and the other tabs still open normally

#### Scenario: Directory exists but holds no openspec directory
- **WHEN** a registered path exists but its `openspec/` directory is gone
- **THEN** it is reported as missing, with the same handling as a deleted path

### Requirement: Removing a project forgets it and deletes nothing

Removing a project SHALL delete its entry from the registry. It SHALL NOT
delete, move or modify any file inside that project.

#### Scenario: Reader removes a project
- **WHEN** the reader removes a project from the dashboard
- **THEN** the tab disappears and every file in that project is left as it was

## Purpose

Defines deterministic fuzzy discovery and filtering for symbols and files when the client does not already know an exact project name.

## ADDED Requirements

### Requirement: Search accepts incomplete symbol and file names
`code_search` SHALL find project symbols and source files without requiring a fully qualified name. It SHALL normalize a non-empty query and candidate using Unicode NFKC and locale-independent lowercase. It SHALL classify a name as exact when normalized values equal, prefix when the candidate starts with the query, and fuzzy when their Damerau-Levenshtein similarity is at least 60 on a 0 through 100 scale.

#### Scenario: Exact symbol name exists
- **WHEN** the client searches for an exact symbol name
- **THEN** exact matches appear before prefix and fuzzy matches

#### Scenario: Symbol name is misspelled
- **WHEN** the client searches with a small spelling error and a close project symbol exists
- **THEN** the close symbol appears with `match_class: fuzzy`, its integer `match_score`, and without being labeled exact

#### Scenario: Query matches a filename
- **WHEN** the query matches a source filename rather than a symbol name
- **THEN** the response returns that file as a selectable discovery result with its normalized project-relative path

### Requirement: Search order is deterministic
The same project revision, query, filters, and result limit SHALL produce the same result order. Match class order SHALL be exact, prefix, then fuzzy. Within a class, higher match score SHALL sort first, followed by normalized project-relative path, symbol kind, and symbol identity.

#### Scenario: Equal-rank candidates are returned
- **WHEN** two candidates have the same match class and score
- **THEN** their order is resolved by stable project-relative path, symbol kind, and symbol identity keys

#### Scenario: Search is repeated without project changes
- **WHEN** the client repeats a query with the same filters and project revision
- **THEN** the ordered identities and ranking evidence are unchanged

### Requirement: Search filters narrow results before the limit
`code_search` SHALL support filters for project path, language, symbol kind, production versus test content, and generated content. File classification SHALL use this precedence: explicit project configuration, generated markers, test markers, production markers, then unknown. The default search SHALL include production, test, and unknown supported source while excluding generated content. A production-only or test-only filter SHALL exclude unknown content.

Project classification configuration SHALL be an optional `.code-explorer.json` object. Its `generated`, `test`, and `production` fields SHALL be arrays of project-relative glob strings. Its `overrides` field SHALL be an array of objects containing exactly `glob`, a project-relative glob string, and `class`, one of `generated`, `test`, or `production`. The class arrays SHALL be evaluated in `generated`, `test`, then `production` order, with a later matching class winning. Override objects SHALL be evaluated afterward in array order, with the last matching object winning. The file SHALL reject unknown keys, non-string class-array entries, override entries with unknown or missing keys, invalid `class` values, absolute paths, parent traversal, and regular-expression syntax. If the file is unreadable or invalid, the service SHALL use defaults, report `classification_config_invalid`, and not disable navigation.

#### Scenario: Client filters by symbol kind and path
- **WHEN** the query includes a function-kind filter and a project-relative path filter
- **THEN** every returned symbol satisfies both filters

#### Scenario: Client requests production content
- **WHEN** the query excludes tests
- **THEN** results classified as test content are omitted before ranking and limiting

#### Scenario: Generated content uses the default policy
- **WHEN** the client does not request generated content
- **THEN** generated files and symbols are omitted and their duplicate source identities do not affect ranking

#### Scenario: Client includes generated content
- **WHEN** the client explicitly includes generated content
- **THEN** generated results may appear and are labeled as generated

#### Scenario: Classification rules conflict
- **WHEN** a path matches a generated marker and an explicit project override classifies it as production
- **THEN** the result is classified as production and reports the override as its classification source

#### Scenario: File classification is unknown
- **WHEN** a supported source path matches no configured, generated, test, or production marker
- **THEN** default search may return it as `unknown`, while production-only and test-only searches omit it

#### Scenario: Classification configuration is malformed
- **WHEN** `.code-explorer.json` contains an unknown key, invalid entry, or path escape
- **THEN** default classification remains active and status reports `classification_config_invalid` for that project-relative file

### Requirement: Sensitive paths are never indexed or returned
The service SHALL exclude `.git/**`, `.hg/**`, `.svn/**`, `.env`, `.env.*`, `**/*.pem`, `**/*.key`, `**/*.pfx`, `**/*.p12`, `**/id_rsa`, `**/id_dsa`, `**/id_ecdsa`, `**/id_ed25519`, `.npmrc`, `.pypirc`, and `NuGet.Config` before backend initialization, search, landmarks, focus, status path lists, and file watching. `.code-explorer.json` SHALL NOT override this denylist. A matching path SHALL expose neither its path nor its content and SHALL be represented only by the aggregate status count `sensitive_paths_excluded`.

#### Scenario: Project contains a denied credential file
- **WHEN** a denied path exists under the frozen project root
- **THEN** no tool or backend receives its path or content and status increments only `sensitive_paths_excluded`

#### Scenario: Project configuration tries to include a denied path
- **WHEN** `.code-explorer.json` classifies a sensitive denied path as production or generated content is explicitly included
- **THEN** the sensitive-path denylist still excludes it and no result reveals whether that specific path exists

### Requirement: Broad searches return a refinement response
Search SHALL enforce a configurable result limit and SHALL report how the client can refine a query when additional candidates were omitted.

#### Scenario: Candidate count exceeds the limit
- **WHEN** more candidates match than the requested or default result limit
- **THEN** the response returns the bounded leading set, the omitted-candidate count, and available narrowing filters

#### Scenario: No candidate matches
- **WHEN** a non-empty query has no symbol or file that satisfies the query and filters
- **THEN** the response returns an empty result set with the applied filters and no guessed replacement

### Requirement: Empty search is reserved for landmarks
An empty normalized `code_search` query SHALL route only to project landmark discovery and SHALL NOT run ordinary symbol or file matching.

#### Scenario: Empty query has no qualifying landmarks
- **WHEN** landmark analysis is ready but no candidate meets the landmark threshold
- **THEN** the response returns an empty landmark set distinct from `landmarks_not_ready`

#### Scenario: Whitespace-only query is submitted
- **WHEN** query normalization removes every query character
- **THEN** the request follows the same landmark path as an empty query

### Requirement: Browser-independent paths use one form
Every discovery result SHALL use a project-relative path with `/` separators regardless of the host operating system or backend path form.

#### Scenario: Backend returns Windows separators
- **WHEN** a backend returns `src\\module\\file.rs`
- **THEN** the search response contains `src/module/file.rs`

#### Scenario: Backend returns a path outside the project root
- **WHEN** a candidate location resolves outside the configured project root
- **THEN** the candidate is rejected and the response reports an out-of-project location error

# fossil/reference-analysis Specification

## Purpose
Builds a replaceable current-code reference graph and grades whether remaining references provide strong or weak evidence that a fossil candidate is alive.
## Requirements
### Requirement: Replaceable reference backend
The analyzer SHALL consume normalized parser results containing source path, target candidates, source span, language, reference kind, strength evidence, and resolved or unresolved status through a language-independent interface. Scoring SHALL depend only on this normalized result.

#### Scenario: Unsupported language degrades to Git evidence
- **WHEN** a fossil candidate uses an unsupported language
- **THEN** analysis completes with its reference subscores marked unavailable

#### Scenario: Unreadable source does not stop analysis
- **WHEN** an eligible source file cannot be read
- **THEN** the analyzer records a warning, marks affected candidate reference scores unavailable, and continues with Git evidence

#### Scenario: Potentially relevant unresolved reference is incomplete evidence
- **WHEN** an unresolved reference has a target candidate matching a fossil candidate's path tail or basename
- **THEN** that candidate's reference weakness and cluster isolation are unavailable instead of treating the missing edge as abandonment evidence

### Requirement: TypeScript and JavaScript references
The regex backend SHALL resolve literal relative specifiers in static imports, `require()` calls, and dynamic `import()` calls between current TypeScript and JavaScript files. It SHALL try the literal path, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, and matching `index` files. Package specifiers, package exports, and tsconfig path aliases SHALL remain unresolved in version 1.

#### Scenario: JavaScript module forms create graph edges
- **WHEN** a current TypeScript or JavaScript file refers to another current file through any supported module form
- **THEN** the graph contains a directed reference from the importer to the resolved target

### Requirement: C# references
The regex backend SHALL recognize namespace-level C# `using` directives. It SHALL replace namespace dots with path separators and resolve only when exactly one current `.cs` path ends with that namespace path.

#### Scenario: Unambiguous C# namespace resolves
- **WHEN** a namespace-level `using` directive maps to one current repository file by convention
- **THEN** the graph contains a directed reference to that file

#### Scenario: Ambiguous C# namespace is not invented
- **WHEN** a namespace-level `using` directive maps to more than one possible file
- **THEN** the analyzer records it as unresolved instead of selecting a target

### Requirement: Rust references
The regex backend SHALL resolve Rust `mod name;` to sibling `name.rs` or `name/mod.rs`. It SHALL resolve literal `use crate::a::b` from the nearest Cargo package's `src` root to `a/b.rs` or `a/b/mod.rs`. Other Rust module forms SHALL remain unresolved.

#### Scenario: Rust module statement creates graph edge
- **WHEN** a Rust source file names a resolvable current crate module
- **THEN** the graph contains a directed reference to the resolved module file

### Requirement: Reference strength
The analyzer SHALL classify a resolved inbound reference as weak only when every identifier usage occurs within a lexically balanced `try` or `catch` region, an `if` or `else` branch containing `fallback`, `legacy`, `old`, or `default` in its condition or leading comment, an `||` or `??` default expression, a C# `#if` region, or a Rust `#[cfg(...)]` item. Any usage outside those recognized regions SHALL make the edge strong. Multiline regions SHALL be classified by balanced delimiters rather than single-line matching.

#### Scenario: Normal direct use is strong
- **WHEN** a non-candidate file directly imports and uses a candidate outside fallback-oriented control flow
- **THEN** the inbound reference is graded strong

#### Scenario: Try or catch use is weak
- **WHEN** every usage of an imported candidate occurs inside a `try` or `catch` block
- **THEN** the inbound reference is graded weak

#### Scenario: Conditional fallback use is weak
- **WHEN** every usage of an imported candidate occurs in a fallback-like conditional branch or default expression
- **THEN** the inbound reference is graded weak

#### Scenario: Guarded use is weak
- **WHEN** every usage of a candidate is controlled by `#if` or Rust `#[cfg(...)]`
- **THEN** the inbound reference is graded weak

#### Scenario: Mixed normal and fallback use is strong
- **WHEN** one imported candidate is used both inside a recognized fallback region and in normal control flow
- **THEN** the inbound reference is graded strong

### Requirement: Vestigial references
The analyzer SHALL grade a reference as vestigial when its source and target are fossil candidates in the same analysis result.

#### Scenario: Fossils do not keep each other alive
- **WHEN** one fossil candidate references another fossil candidate
- **THEN** that edge is graded vestigial and does not count as a strong live inbound reference

### Requirement: Repository-contained source reads
The analyzer SHALL canonicalize the repository root and every file before reading content. It SHALL read only stable regular files whose real paths remain within the repository root, SHALL never follow directory symlinks or Windows junctions, and SHALL keep a visited-realpath set. A path that disappears, changes type, becomes unreadable, or resolves differently during analysis SHALL produce a warning and unavailable affected reference scores.

#### Scenario: Relative import cannot escape the repository
- **WHEN** a source reference resolves lexically outside the repository or through a symlink to an external target
- **THEN** the analyzer skips the target and records a bounded warning without exposing the external path

#### Scenario: Directory symlink is not traversed
- **WHEN** an inventory path is a directory symlink, Windows junction, or repeated real path
- **THEN** the analyzer does not enumerate or read its target

#### Scenario: File changes during scanning
- **WHEN** an inventoried file disappears, changes type, becomes unreadable, or resolves to another real path before its content read
- **THEN** the analyzer records a warning and does not treat its missing reference data as evidence of abandonment

### Requirement: Bounded source scanning
The regex backend SHALL use linear-time expressions, inspect at most 1 MiB per file and 256 MiB per analysis, and detect binary content before text parsing. The report SHALL publish configured limits, consumed bytes, omitted path counts, and `referenceAnalysisComplete: false` when any content is skipped. Files skipped by these limits SHALL produce warnings and unavailable affected reference scores.

#### Scenario: Oversized source degrades reference evidence
- **WHEN** an eligible source file exceeds 1 MiB
- **THEN** its content is skipped, a warning is recorded, and affected candidate reference scores are unavailable

#### Scenario: Total scan budget stops further content reads
- **WHEN** eligible content reaches 256 MiB in one analysis
- **THEN** remaining content is skipped with a warning and its affected candidate reference scores are unavailable

#### Scenario: Binary file is not regex parsed
- **WHEN** the initial content sample contains a NUL byte
- **THEN** the file is treated as binary and omitted from reference parsing

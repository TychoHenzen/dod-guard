## Purpose

Surfaces old untracked or ignored workspace files without discovered usage evidence as review items, without presenting heuristic evidence as deletion proof.

## ADDED Requirements

### Requirement: Workspace file discovery
The analyzer SHALL enumerate non-ignored untracked paths with `git ls-files -z --others --exclude-standard` and ignored paths with `git ls-files -z --others --ignored --exclude-standard`. It SHALL inspect regular repository-contained files whose last modification time is less than or equal to analysis time minus the configured untracked age, independently of Git fossil scoring. It SHALL obtain ignore provenance through NUL-delimited `git check-ignore -z -v --stdin` and record whether the matching rule came from a repository, per-repository exclude, or global exclude source.

#### Scenario: Old untracked file is eligible
- **WHEN** an untracked non-ignored file is at least the configured untracked age
- **THEN** the file is evaluated for workspace-debris evidence

#### Scenario: Old ignored file is eligible
- **WHEN** an ignored file is at least the configured untracked age
- **THEN** the file is evaluated and its matching ignore rule is recorded

#### Scenario: Recent workspace file is omitted
- **WHEN** an untracked or ignored file is newer than the configured untracked age
- **THEN** it does not appear as workspace debris

#### Scenario: Age threshold is inclusive
- **WHEN** a workspace file's last modification equals analysis time minus the configured untracked age
- **THEN** the file is eligible for workspace-debris evidence

#### Scenario: Unreadable discovered path is distinguished
- **WHEN** Git discovers an eligible workspace path but the filesystem denies metadata or content access
- **THEN** the report records a discovered-but-unreadable warning without classifying the path as debris

### Requirement: Portable age evidence
The analyzer SHALL label last modification time as filesystem metadata rather than creation, usage, or obsolescence history and SHALL treat creation time as advisory metadata only. Every debris result SHALL name `mtime` as its age source and state that copying, restoring, extracting, or rebuilding can change it. The analyzer SHALL not use access time as proof of use or non-use.

#### Scenario: Unavailable creation time does not block analysis
- **WHEN** a filesystem does not provide a reliable creation timestamp
- **THEN** workspace-debris eligibility is still determined from last modification time

#### Scenario: One captured time controls age boundaries
- **WHEN** fixture mtimes fall one instant before, exactly at, and one instant after the age cutoff calculated from the captured analysis time
- **THEN** the first two files are eligible and the third file is recent

### Requirement: Usage evidence search
The analyzer SHALL search eligible repository-contained tracked and workspace source files for the supported resolved imports, an exact normalized repository-relative path string, or an exact candidate basename when that basename is unique in the inventory. A result SHALL say `no detected references`, name the repository root as its analysis boundary, and list reflection, runtime path construction, generated configuration, external consumers, and unsupported languages as unobserved mechanisms. It SHALL prefer omission when evidence is ambiguous.

#### Scenario: Referenced old file is omitted
- **WHEN** an old workspace file has discovered inbound usage evidence
- **THEN** it is not reported as possible workspace debris

#### Scenario: Unreferenced old file is reported
- **WHEN** an old workspace file has no discovered inbound usage evidence
- **THEN** it is reported in the separate workspace-debris category

### Requirement: Safe workspace boundaries
The analyzer SHALL exclude Git internals; dependency stores named `node_modules`, `vendor`, `.pnpm-store`, `.yarn`, or `.cargo`; and sensitive paths matched case-insensitively against `.env`, `.env.*`, `.npmrc`, `.pypirc`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `*.kdbx`, `credentials*`, or directories named `.aws`, `.ssh`, `.gnupg`, or `.kube`. Caller-supplied exclusion globs SHALL apply before metadata access. Every symlink and Windows junction SHALL be excluded from inspection and findings. The analyzer SHALL never emit excluded paths, ignore-rule text, file contents, or matched source excerpts.

#### Scenario: Dependency store is excluded
- **WHEN** an old ignored file is under a recognized dependency store such as `node_modules`
- **THEN** it is not inspected or reported as workspace debris

#### Scenario: Sensitive file is excluded
- **WHEN** an old workspace file matches a sensitive environment-file pattern
- **THEN** its content and path are omitted from workspace-debris output

#### Scenario: External symlink is excluded
- **WHEN** a discovered workspace path is any symbolic link or Windows junction
- **THEN** its target is not read and the symlink is not reported as workspace debris

#### Scenario: Caller exclusion hides a path completely
- **WHEN** a workspace path matches a caller-supplied exclusion glob
- **THEN** fossil does not read its metadata or content and does not include its path or ignore provenance in output

### Requirement: Review-only reporting
Every workspace-debris result SHALL carry `classification: advisory`, state `review: possible workspace debris`, include modification age and its uncertainty, ignore provenance, analysis boundary, unobserved reference mechanisms, and detected reference evidence, and SHALL NOT claim that deletion is safe or mutate the filesystem. A cleanup consumer SHALL require explicit user confirmation and revalidate the current path and references.

#### Scenario: Finding preserves uncertainty
- **WHEN** a workspace file meets the debris heuristics
- **THEN** table and JSON output identify it as a review item rather than a fossil or safe deletion

#### Scenario: Large ignored tree is summarized
- **WHEN** at least 20 reportable files share one ignored top-level directory
- **THEN** normal table output emits a directory summary while verbose and JSON output retain the individual findings

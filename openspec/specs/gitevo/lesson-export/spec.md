# Lesson Export Specification

## Purpose

Defines how gitevo records what an attempt taught, lists those lessons back,
and hands them to another tool. The store's schema and query surface belong
to `gitevo/memory-bus`. Branching operations belong to
`gitevo/branch-lifecycle`. This spec covers `evo_learn`, `evo_lessons`,
`evo_export_lessons`, and the
one-time migration of the legacy lessons file.

## Requirements

### Requirement: Recording a lesson attributes it to the active branch

`evo_learn` SHALL write the given content as an INSIGHT message. It SHALL
attribute that message to whichever branch is active when the call happens.
`evo_learn` SHALL also report that branch's name in its reply.

#### Scenario: Lesson recorded on the current branch
- **WHEN** `evo_learn` is called with a lesson while a branch is active
- **THEN** the lesson is stored attributed to that branch and the reply names
  the branch

### Requirement: Listing lessons shows the newest first

`evo_lessons` SHALL list every stored lesson, newest first, numbered from 1.
Each line SHALL show the lesson's timestamp, its branch, and its content.
Ties in timestamp SHALL break on insertion order, most recent insertion first.
`evo_lessons` SHALL report that no lessons are recorded when the store holds
none.

#### Scenario: No lessons recorded
- **WHEN** `evo_lessons` is called before any lesson has been recorded
- **THEN** it reports that no lessons are recorded

#### Scenario: Multiple lessons listed newest first
- **WHEN** two lessons have been recorded on different branches
- **THEN** `evo_lessons` lists the most recently recorded lesson as entry 1,
  naming its branch

### Requirement: Export emits JSON the obsidian-rag memory_save tool accepts

`evo_export_lessons` SHALL emit every stored lesson as a JSON array, newest
first, in the shape the obsidian-rag `memory_save` tool accepts. Each entry SHALL carry an id, a title truncated to 80 characters, and a
description naming the source branch. It SHALL also carry the full content,
a type of "feedback", and metadata naming the source and branch.
`evo_export_lessons` SHALL emit an empty array when no lessons are stored.

#### Scenario: Empty store exports as an empty array
- **WHEN** `evo_export_lessons` is called before any lesson has been recorded
- **THEN** it emits exactly `[]`

#### Scenario: Long lesson content is truncated in the title only
- **WHEN** a stored lesson's content is longer than 80 characters
- **THEN** the exported entry's title is truncated to 80 characters while its
  content field carries the lesson in full

### Requirement: Export identifiers are content-derived and idempotent

Each exported entry's id SHALL be derived from a SHA-256 hash of the lesson's
content, branch, and timestamp. Exporting the same stored lessons more than
once SHALL produce the same ids each time.

#### Scenario: Re-export produces identical ids
- **WHEN** `evo_export_lessons` is called twice with no new lessons recorded
  in between
- **THEN** both exports assign the same id to each corresponding lesson

### Requirement: The memory bus is the single source of truth for lessons

Lesson storage and listing SHALL read and write through the memory bus
described in `gitevo/memory-bus`, never through the legacy line-delimited
lessons file directly. The legacy file SHALL exist only as an input to
migration.

#### Scenario: Lesson recorded directly is exported alongside a migrated one
- **WHEN** a lesson recorded through `evo_learn` and a lesson carried over from
  the legacy file both exist in the store
- **THEN** `evo_export_lessons` emits both, because export reads lessons by
  message type alone

### Requirement: Re-running init migrates the legacy file and then clears it

Initializing gitevo again on a repository holding a legacy lessons file
SHALL migrate every entry in that file into the memory bus. It SHALL then
clear the file's contents. Lessons already present in the memory bus SHALL
survive the migration and the clear.

#### Scenario: Legacy file present on re-init
- **WHEN** gitevo is initialized again while `.evo/lessons.jsonl` holds
  entries
- **THEN** each entry is recorded in the memory bus as a lesson, and the file
  is left empty afterward

#### Scenario: Lessons already in the store are not lost
- **WHEN** gitevo is initialized again after lessons were already recorded
  directly through `evo_learn`
- **THEN** those lessons remain listed and exportable after the file is
  cleared

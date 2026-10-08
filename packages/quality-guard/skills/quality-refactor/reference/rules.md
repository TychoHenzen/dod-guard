# Rule Reference

One section per scanner rule: what it measures, why the bound is where it is,
how to fix it, and how it can be wrong. Refactoring names in *italics* are from
Fowler's catalog - see `catalog.md`.

The matrix below is the single source-and-disposition catalog for configured
rules. Thresholds are diagnostic starting points for review, not universal
Clean Code limits or correctness gates. A finding is evidence to inspect with
the surrounding design, tests, language, and repository conventions. The
scanner remains advisory when a source pattern cannot prove intent.

## Source and disposition matrix

| Rule | Source contract | Configured signal or disposition |
| --- | --- | --- |
| `line-length` | `formatting/vertical-structure.md`; `emergence/pragmatic-size.md` | 80 preferred / 120 hard diagnostic signals; wrap or rename when it improves intent, not to satisfy a number blindly. |
| `file-length` | `classes/srp-and-class-size.md`; `emergence/pragmatic-size.md` | 100 preferred / 300 hard diagnostic signals; split at a real responsibility boundary. |
| `partial-type-length` | `classes/srp-and-class-size.md`; `successive-refinement/polymorphic-parsing-and-errors.md` | 100 preferred / 300 hard combined lines of a C# partial type split across hand-written files; a partial split is not a responsibility boundary. |
| `function-length` | `functions/small-and-focused.md`; `emergence/pragmatic-size.md` | 30 preferred / 60 hard diagnostic signals; extract a named concept when cohesion or verification suffers. |
| `complexity` | `functions/small-and-focused.md`; `smells-and-heuristics/structure-and-abstraction.md` | 5 preferred / 10 hard diagnostic signals; simplify paths when the function stops expressing one idea. |
| `param-count` | `functions/arguments.md` | 3 preferred / 7 hard diagnostic signals; introduce a parameter object or query when arguments form a clump. |
| `nesting-depth` | `functions/small-and-focused.md`; `smells-and-heuristics/structure-and-abstraction.md` | 3 preferred / 5 hard diagnostic signals; use guard clauses when depth obscures the main path. |
| `types-per-file` | `classes/srp-and-class-size.md`; `emergence/pragmatic-size.md` | More than 1 top-level type is a navigability signal; split only when the resulting ownership is clearer. |
| `duplicate-block` | `smells-and-heuristics/functions-and-duplication.md`; `emergence/duplication-and-reuse.md` | Six-line windows and two sites are search signals; retain coincidental duplication when sharing would couple unrelated concepts. |
| `comment-bloat` | `comments/intent-and-limits.md`; `comments/bad-comments.md` | 2x preferred / 4x hard comment-to-code ratios are review signals; retain context a reader cannot derive. |
| `else-branch` | `functions/polymorphism-and-names.md`; `dispositions.md` | Syntax-only preferred signal; a genuine two-way branch is legitimate and remains reviewable. |
| `unnamed-tuple` | `meaningful-names/intent-and-disinformation.md` | Declared tuples are naming signals; local destructuring is not a finding. |
| `dead-export` | `smells-and-heuristics/functions-and-duplication.md` | Reference-graph evidence; reflection, dependency injection, dynamic imports, and manifests remain explicit review cases. |
| `unused-local` | `smells-and-heuristics/functions-and-duplication.md` | Static same-file reference evidence; dynamic TypeScript lookups, reflection, and string dispatch can still trigger a false positive and require human review. |
| `test-only-export` | `smells-and-heuristics/functions-and-duplication.md` | Test-only reachability is advisory because fixtures and production seams share the same graph shape. |
| `commented-out-code` | `comments/bad-comments.md` | Comment syntax is a removal signal; version control retains historical code. |
| `comment-restates-code` | `comments/bad-comments.md`; `comments/intent-and-limits.md` | Repeated intent is a review signal; keep a comment that explains a non-obvious constraint. |
| `comment-metadata` | `comments/bad-comments.md` | Stale author/history metadata is a review signal; keep current tool or protocol metadata when it is required. |
| `comment-placeholder` | `comments/bad-comments.md`; `comments/good-comments.md` | Empty placeholders are a review signal; replace them with an actionable issue or useful context. |
| `comment-missing-reference` | `comments/intent-and-limits.md` | An incomplete reference is a review signal; the scanner does not infer which external source was intended. |
| `output-parameter` | `functions/arguments.md` | Explicit output syntax is a design signal; caller-owned mutation or framework contracts may justify it. |
| `flag-parameter` | `functions/arguments.md` | Explicit boolean behavior switches are review signals; data booleans and one coherent operation may remain. |
| `wildcard-import` | `smells-and-heuristics/overview.md`; `dispositions.md` | Retain only syntax-proven Python/Rust wildcard findings; quiet language forms without the same proof. |
| `naming-encoding` | `meaningful-names/intent-and-disinformation.md` | Explicit `m_`/`f_` member prefixes are review signals; other naming policy stays language or repository-specific. |
| `build-entrypoint` | `smells-and-heuristics/comments-and-environment.md` | Missing root build command is a reproducibility signal; the scanner does not invent project commands. |
| `test-entrypoint` | `smells-and-heuristics/comments-and-environment.md` | Missing root test command is a reproducibility signal; the scanner does not infer a complete test workflow. |
| `todo-marker` | `comments/good-comments.md`; `comments/bad-comments.md` | Bare deferred-work markers are review signals; linked, current work items may be retained. |
| `stateless-method` | `classes/srp-and-class-size.md`; `emergence/pragmatic-size.md`; `dispositions.md` | Syntax-only candidate for a free function; ownership, inheritance, and framework intent are not inferred. |
| `assumption-marker` | `comments/good-comments.md`; `comments/intent-and-limits.md` | Retired from generic scanning: `ASSUMPTION` has no source/use contract, so it is quiet rather than a policy finding. |
| `test-quality` | `smells-and-heuristics/test-strategy.md` | Separate report-only T1-T9 evidence path; manifests and coverage observations are diagnostic, never a commit gate. |

## Resolving authority sources

Each path in the matrix's **Source contract** column is relative to the
external Clean Code collection at
`<DOD_GUARD_KNOWLEDGE_BASE_DIR>/entries/clean-code/<source-path>`. Set
`DOD_GUARD_KNOWLEDGE_BASE_DIR` to the vault parent; the knowledge-base server
adds `entries` itself. For example, `functions/arguments.md` resolves to
`<DOD_GUARD_KNOWLEDGE_BASE_DIR>/entries/clean-code/functions/arguments.md`.
Do not resolve these paths against the installed Quality Guard plugin: the
plugin ships the policy synthesis, while the configured knowledge base owns
the source-linked entries.

---

## `dead-export` - exported, never referenced

**Detects:** a public symbol with zero references anywhere in the scan outside
its own file. Entry-point files (`index`, `main`, `mod`, `lib`, `cli`,
`program`, `app`, `server`, `setup`, `conftest`, `__init__.py`) are exempt.

**Why hard:** dead code is read, maintained, refactored, and reasoned about by
every future reader, and pays back nothing. It also lies - a reader assumes an
export has callers and looks for them.

**Fix:** *Remove Dead Code*. Delete the symbol and its tests. If it is a public
API of a published package, that is the one real exception - mark it and move
on.

**Non-code references count.** A Godot node connects a script through a
`.tscn`, and a project file connects a class through a path. The scanner reads
these manifest files as reference evidence, so a `PlayerController` attached to
a scene node is live even though no code names it. A hit in a manifest counts
as a production reference, never a test reference, because scene and config
wiring is real usage. `MANIFEST_EXTS` in `scripts/lib/config.mjs` lists the
extensions. Manifests are collected from `--root`, not from the scanned target
paths, because the scene file that wires a script routinely sits above the
directory being scanned.

Generic data formats are deliberately not manifest extensions. That covers
`.md`, `.json`, `.yaml`, `.xml` and `.toml`. A file that mentions a class name
is not usage, and counting it hides real dead code. Those formats are also the
shape most build artifacts, caches and audit reports take. Such files are
usually gitignored, so counting them made the same commit pass on a developer
machine and fail in CI.

**False positives:** symbols reached by reflection, dependency injection by
string name, or dynamic `import()`. Check before deleting a symbol whose name
appears in a decorator or in a file type the manifest list does not cover.

**Rust's own-file test module counts too.** A `#[cfg(test)]` module usually
sits in the same file as the code it tests. A reference from inside one is
test evidence, not production evidence, and a reference from outside one in
that same file is production evidence, the same as a reference from any other
file. Both directions used to be invisible: the reachability check used to
skip a symbol's own file outright, so a `pub fn` referenced only by its
file's own `#[cfg(test)]` module looked entirely unreferenced and reported as
`dead-export` instead of `test-only-export`.

---

## `unused-local` - private, never called in its own file

**Detects:** a free function in TypeScript/JavaScript or Rust that has no
export keyword and appears exactly once in its file - its own definition. Class
methods are excluded (they can be called through an instance from anywhere).

**Why hard:** in these languages a file is a module, so a non-exported symbol
that its own file never calls is unreachable by construction. This is not a
heuristic; it is a proof.

**Fix:** *Remove Dead Code*.

**False positives:** functions referenced only inside a plain string literal,
dynamic TypeScript/JavaScript lookup such as `globalThis["foo"]()`, reflection,
dependency injection, or other string-based dispatch can still be reported.
Review these cases before deleting a symbol; the scanner does not resolve
runtime name lookup.

**Rust is the opposite risk: a false negative, not a false positive.** Every
double-quoted Rust string, not only a `format!`/`println!` argument, is
scanned for `{identifier}` captures, because telling a format-macro argument
apart from an ordinary string would need a real parse of the call site. A
name that appears only inside some unrelated plain string, never actually
interpolated anywhere, reads as a reference and hides the symbol from this
rule. This can only suppress a real violation, never invent one, so it is
left as-is rather than fixed.

---

## `test-only-export` - production code that only tests use

**Detects:** an export with zero references from non-test files and at least
one from a test file.

**Why it matters:** this is the most expensive kind of dead code, because it
comes with tests that make it look alive. The tests pass, the coverage number
is good, and none of it runs in production.

**Why this one only warns:** two different things look identical here. One is a
production symbol that only tests call. The other is a test-support symbol that
only tests are ever supposed to call. A fixture builder, a fake, or a scenario
harness has exactly the same reference graph as real dead code. When the rule
was an error it marked whole test harnesses for deletion. It now reports an
advisory finding for human review rather than deciding whether a commit passes.

**Declare your harness directories.** Pass `--test-path=<fragment>` once per
directory that holds test-support code the built-in patterns miss, for example
`--test-path=Scenario/`. A file whose relative path contains the fragment
counts as test code, so its exports are never subjects of this rule. The
built-in patterns already cover `test`, `tests`, `__tests__`, `testing`,
`fixtures`, `harness`, `mocks`, `stubs`, and the `.test.` and `.spec.` name
forms.

**Rust needs no `--test-path` for its own `#[cfg(test)]` module,** because
that module lives inside the same file as production code, not in a
separate test file or directory `--test-path` could point at. A `#[cfg(test)]`
or `#[cfg(all(test, ...))]` block is recognized directly: a reference from
inside one counts as test evidence for this rule, the same way a whole test
file's reference does everywhere else. See `dead-export` above for how the
symbol's own file stopped being skipped for this.

**Fix:** delete the symbol and its tests together. If the logic is genuinely
needed but only reachable through a larger unit, test it through that unit
instead. That is the test you actually wanted.

**Exception:** a symbol exported purely as a seam for dependency injection.
That is a real pattern. Note it and keep it.

---

## `duplicate-block` - the same six lines in two places

**Detects:** identical windows of six consecutive non-trivial lines, compared
after whitespace normalization, across all scanned files. Comment lines are
ignored; a window needs at least four distinct lines so that repetitive data
tables do not register.

**Why this is a diagnostic signal:** the second occurrence is where duplication
can become a maintenance hazard, because now a fix can be applied to one and
not the other. The threshold points to a review; it does not prove that two
conceptually unrelated blocks must be merged.

**Fix:** *Extract Function*, then *Move Function* if the extracted function has
a natural home. If the two copies have small differences, *Parameterize
Function*. If they differ only in a flag, do **not** add a boolean parameter - see `else-branch` and *Remove Flag Argument*.

**When to leave it:** two blocks that are textually identical but conceptually
unrelated will diverge, and merging them creates coupling. This is a real case
and it is rarer than it feels. Note it explicitly rather than silently skipping.

---

## `commented-out-code` - a statement inside a comment

**Detects:** a non-doc comment whose text both starts like a statement
(`if`, `for`, `return`, `const`, `function`, `def`, `public`, `import`, ...) and
ends with a terminator (`; { } [ ] ) ,`). Doc comments are exempt so that prose
quoting code is not flagged.

**Why hard:** it is a note that says "this might come back" written to a place
nobody reads on purpose. Version control already stores it, with the commit
message explaining why it left.

**Fix:** delete it.

---

## `types-per-file` - one type per file

**Detects:** more than one top-level `class` / `interface` / `enum` / `type` /
`struct` / `trait` / `record` in one file. Nested types are not counted, and a
wrapping `namespace` / `mod` / `package` block does not count as nesting.

**Why this is a diagnostic signal:** the bound is 1, with no preferred tier,
because there is no "mostly one type." The rule points at navigability and
ownership; it does not prove that every related type must move to another file.
Keeping diffs, blame, and merge conflicts around one concept still depends on
the actual design boundary.

**Fix:** *Extract Class* into a new file named for the type. Put small related
types in a sibling directory, not a shared file. A discriminated-union member
set is the common objection - those still get one file each, plus one file for
the union.

**Note:** this rule is where LLM-written code fails most consistently, because
"these types are related" feels like a reason to co-locate. Relatedness is what
directories are for.

---

## `file-length` - 100 preferred, 300 hard

**Detects:** total lines, including blanks and comments.

**Why these numbers:** 100 lines is a useful first review point and 300 is a
stronger signal that a reader may need search instead of a single mental model.
They are not a universal file-size law. A cohesive file can be better than a
split that creates two owners which must always change together.

**Fix:** the split has to follow a real seam - *Extract Class*, *Extract
Function* into a new module, or *Split Phase* when the file does two things in
sequence. If no seam exists, a long cohesive file is better than two files that
must always change together. Do not introduce partial classes solely to satisfy
numeric file or line limits. A partial class is appropriate only for a strong,
documented domain, framework, or ownership reason; otherwise say so and leave a
cohesive class alone. The scanner measures a split partial type as one unit
through `partial-type-length`, so moving members into another `partial` file
does not clear this finding.

---

## `partial-type-length` - 100 preferred, 300 hard, across files

**Detects:** a top-level C# `partial` type whose declarations sit in more than
one hand-written `.cs` file in the same directory and namespace. The metric is the combined
line count of every declaring file, reported on each of them. Compiler and
source-generator output (`*.g.cs`, `*.g.i.cs`, `*.Designer.cs`,
`*.generated.*`) is not counted, and a single `partial` declaration, such as a
Godot node script, is never a finding.

**Why this is a diagnostic signal:** a partial type is still one class. Its
fields, invariants, and reasons to change are shared by every file that
declares it, so splitting it by member group hides its size from `file-length`
without reducing what a reader must hold in mind.

**Fix:** treat it as a `file-length` finding on the whole class. Merge the
parts back, then *Extract Class* for each cohesive group of fields and the
methods that use them, *Move Function* for operations that belong to another
owner, or *Split Phase* when the class runs two stages in sequence. Keep a
split partial only for a documented framework, generator, or ownership reason.

---

## `function-length` - 30 preferred, 60 hard

**Detects:** lines from signature to closing brace (or dedent, in Python).

**Why this is a diagnostic signal:** it points at the *Long Method* smell. A
function longer than a screen may be harder to verify by reading, but the
number alone does not prove that extraction improves the design.

**Fix:** *Extract Function* - but extract a **concept**, not a line range. If
you cannot name the extracted function without referring to its position
("part two", "step three", "helper"), the split is in the wrong place.

---

## `complexity` - 5 preferred, 10 hard

**Detects:** cyclomatic complexity, counted as 1 plus each `if`, `for`,
`while`, `case`, `catch`, `&&`, `||`, `??`, ternary, and (in Rust) `match` arm.

**Why 10 is a stronger signal:** at complexity 10 a function has at least 10
independent paths, which is roughly where exhaustive testing often becomes
impractical and readers may start missing a branch. It is not a universal
correctness boundary.

**Why 5 is a preferred signal:** many functions that do one thing land at 1 -
4, so a function at 6 deserves review. It can still be one coherent operation.

**Fix, in order of preference:**

1. *Replace Nested Conditional with Guard Clauses* - usually the biggest win.
2. *Decompose Conditional* - name the condition, name the branches.
3. *Consolidate Conditional Expression* - merge conditions with the same result.
4. *Replace Conditional with Polymorphism* - for a switch on a type code.
5. *Extract Function* - last, because it moves complexity rather than removing
   it. Splitting a complexity-12 function into two complexity-6 functions that
   are always called in sequence is laundering, not simplification.

---

## `nesting-depth` - 3 preferred, 5 hard

**Detects:** maximum brace depth inside a function body (indent levels in
Python).

**Why this is a diagnostic signal:** each level is a condition the reader has
to hold. Depth 5 can mean five simultaneous conditions to understand the
innermost line, but the count alone does not establish a defect.

**Fix:** *Replace Nested Conditional with Guard Clauses*. Invert the condition,
return early, and let the happy path run at depth 1. This usually fixes
`else-branch` and `complexity` in the same edit.

---

## `param-count` - 3 preferred, 7 hard

**Detects:** declared parameters. `this` is not counted, and neither is a
Rust receiver in any of its forms: `self`, `mut self`, `&self`, `&mut self`,
and the same with an explicit lifetime (`&'a self`, `&'a mut self`). Only the
bare `self` form used to be excluded; a method taking `&self`, by far the
more common form in real Rust code, used to count its own receiver as a
declared parameter.

**Why 7 is a stronger signal:** it points at the *Long Parameter List* smell.
Past a handful, call sites can become positional puzzles and every insertion is
a breaking change no compiler catches when the types happen to match.

**Why 3 is a preferred signal:** most functions that need four arguments may be
being handed a *Data Clump* - a group of values that always travel together and
want to be a type.

**Fix:**

- *Introduce Parameter Object* for a data clump.
- *Preserve Whole Object* when you are passing three fields of the same object.
- *Replace Parameter with Query* when the callee can derive the value.
- *Remove Flag Argument* for booleans - a boolean parameter means the function
  is two functions.

---

## `output-parameter` - explicit output parameters

**Detects:** C# `ref` / `out` parameters and Rust parameters whose type is
directly `&mut T`. It does not infer output intent from names, containers,
mutation, call sites, or unsupported languages.

**Why hard:** an output parameter makes a function's result flow through a
second channel. Callers must allocate and pass a value before they can see
what the function produced.

**Fix:** return the produced value, or return a small named result type when
the operation has more than one result.

**False positives:** APIs that must mutate caller-owned state or satisfy an
external framework contract can keep the parameter. The scanner deliberately
leaves Python and TypeScript output idioms quiet because their syntax does not
prove output intent.

---

## `flag-parameter` - explicit boolean flags

**Detects:** C# `bool` / `System.Boolean`, TypeScript `boolean`, and Rust
`bool` parameters when the type is explicitly declared. Inferred, generic,
union, nullable, optional, and default-valued forms are left quiet. C# `ref`,
`out`, and `in` modifiers do not suppress an explicit boolean type signal;
Rust reference types and TypeScript's fake `this` parameter remain quiet.

**Why hard:** a boolean argument usually selects between two behaviors, which
means the function has two responsibilities hidden behind one call shape.

**Fix:** split the behaviors into named functions, or replace the flag with a
policy type when the choice is an actual domain value.

**False positives:** a boolean that is data rather than a behavior switch can
be valid. Keep it when the two paths are genuinely one operation and the name
makes the policy obvious.

---

## `wildcard-import` - explicit wildcard imports

**Detects:** Python `from module import *` and Rust `use path::*` declarations.
These are the only J1 forms with a syntax-proven wildcard boundary in the
generic scanner.

**Why hard:** wildcard imports hide the names a file depends on and make the
public namespace harder to review. Import explicit names instead.

**When quiet:** C# namespace `using`, TypeScript namespace imports and
`export *`, inherited or static constants, and enum-like declarations are not
reported. Those forms do not prove the corresponding Java-origin smell without
language-specific semantic evidence.

---

## `naming-encoding` - member type/scope prefixes

**Detects:** C#, TypeScript, Rust, and Python member declarations or `self`
assignments whose name begins with the explicit `m_` or `f_` prefixes named by
Clean Code's N6 guidance. This is review-level evidence, not a semantic naming
verdict.

**Why hard:** type and scope encodings make readers translate private shorthand
that modern tools already expose. Remove the prefix and keep the name focused
on intent.

**When quiet:** local variables, arbitrary abbreviations, generated/interop
paths, and project-specific naming conventions outside the two accepted prefixes
are not reported. N1-N5 and N7 remain semantic guidance rather than generic
findings.

---

## `unnamed-tuple` - tuple types

**Detects:** named and unnamed tuple types in supported type positions:
TypeScript `: [A, B]` and `[first: A, second: B]`; C# `(int, string)` and
`(int first, string second)` return types; Rust `-> (A, B)`; Python
`-> Tuple[A, B]`.

**Why this is a diagnostic signal:** `result.0` and `result[1]` carry no
meaning, so every call site re-derives what the fields are. Adding or
reordering a field silently breaks every destructuring that still compiles.

**Fix:** *Replace Primitive with Object* - declare a named type such as a
record, struct, class, or interface. Naming tuple elements does not exempt the
tuple. Local destructuring (`const [a, b] = ...`) is not flagged because it is
not a declared tuple type.

---

## `else-branch` - prefer guard clauses

**Detects:** any `else` in a function body, including `else if`.

**Why preferred, not hard:** an `else` is not wrong, but it is the single most
reliable marker of a function that could read top-to-bottom and does not. A
guard clause states a precondition and leaves; an `else` asks the reader to
carry both branches to the end of the function.

**Fix:** *Replace Nested Conditional with Guard Clauses*. Handle the exceptional
case first and return. For an `else if` chain dispatching on a type,
*Replace Conditional with Polymorphism* or a lookup table.

**When to keep it:** a genuine two-way branch where both sides are equally
"normal" and both produce a value. Ternaries and expression-position matches
are fine.

---

## `stateless-method` - a method that never touches state

**Detects:** a non-static method inside a class whose body references neither
`this`/`self` nor any field declared in that class. In Rust there is no class
body to check: a struct's fields live in the `struct`, and its methods live
in a separate `impl` block. This rule now follows that split, attributing an
`impl Type { ... }` block's methods to the matching `struct Type`'s fields in
the same file. Before this, no Rust `impl` block was ever attributed to a
type at all, so this rule never fired on Rust code, silently, for every file.
When a type's `impl` block is in the file but its `struct` is not, field
access cannot be proven either way, so the method is left unreported rather
than guessed at.

**Why preferred:** Meyers' guideline - prefer non-member non-friend functions.
A free function can only use the type's public surface, so it cannot become a
hidden dependency on internals, and it does not grow the class's interface. A
data type should hold data.

**Fix:** move it out of the class. C#: an extension method. TypeScript: an
exported function in the same module. Rust: a free function, or a separate
`impl` block that does not take `self`.

**False negatives:** field detection is per-language, and each shape still
has gaps. Java and a plain C# field need their own visibility modifier
(`private int balance;`) to be recognized at all. A C# auto-property
(`Foo { get; set; }`) or expression-bodied property (`Foo => expr;`) is
recognized as a field too, but a constructor-shorthand property is not. A
C++ field needs no modifier of its own - fields grouped under a
`private:`/`protected:`/`public:` section are recognized whichever section,
explicit or default, holds them - but a pointer or reference member written
with no space before its name (`int* p;`) is missed. A Rust struct field
needs no modifier either (`bar: i32,`, with or without `pub`). In every
class-based language here, a field inherited from a base type declared in
another file is missed.

---

## `configurable-data` - Clean Code G35

**Detects:** a configuration-looking parameter with a literal default inside a
file matched by a configured lowLevelPathGroups entry. The current proxy
recognizes names such as timeout, retry, limit, path, url, mode, capacity, and
enabled, and only numeric, string, or boolean/null-like literal defaults. The
finding is review evidence, not proof that the value is owned at the wrong
abstraction level.

Configure the ownership boundary explicitly:

~~~json
{
  "pathGroups": { "infrastructure": ["src/infra/**"] },
  "lowLevelPathGroups": ["infrastructure"]
}
~~~

**Fix:** review whether the default belongs at an entry point or policy owner,
then pass the selected value into the lower-level operation.

**Not reported:** files outside configured low-level groups, tests, generated
files, non-configuration parameter names, computed defaults, and Rust
functions. Rust has no ordinary default-parameter syntax, so this exact proxy
is intentionally inapplicable there rather than guessing that Option, Default,
constants, environment reads, or builders mean the same thing.

**False positives:** a low-level function may intentionally own a fallback or
the configured path group may be broader than its real ownership boundary.
Use the finding to review intent; it is never a fail-closed semantic violation.

---

## `transitive-navigation` - Clean Code G36

**Detects:** an explicit this/self receiver followed by at least two simple
zero-argument member calls, such as
this.client.get().store().save(). The rule reports a review candidate with the
receiver, ordered hops, method, and source line; it does not claim that every
chain violates the Law of Demeter.

**Fix:** review whether the operation belongs behind an immediate collaborator,
facade, or aggregate method so the caller does not know the non-immediate
collaborator path.

**Not reported:** local-variable roots, optional or indexed access,
argument-bearing or dynamic calls, declarations, tests, generated files, and
chains whose receiver or hop names contain a configured fluent marker. The
default markers are builder, fluent, pipeline, and query; add repository-specific
markers with fluentMarkers when a legitimate fluent API uses another name.

**False positives:** naming cannot prove that a chain is harmful, and a
two-hop chain may still be a legitimate value transformation. Keep the
finding review-only and treat unsupported syntax as silent rather than
guessing.

---

## `build-entrypoint` - Clean Code E1

**Detects:** a root `package.json` without a `build` script.

**Why:** `npm run build` is one explicit command a contributor can run after
checkout. A project that needs readers to reconstruct its build sequence has no
reliable build entry point.

**Fix:** add a root `build` script that owns the complete build. Cargo and one
.NET project root already have `cargo build` and `dotnet build <project>`; a
Python root needs a `[build-system]` declaration. Multiple root .NET projects
need one selected solution. Unknown layouts produce explicit E1/E2 findings at
the repository root; the scanner does not invent commands.

---

## `test-entrypoint` - Clean Code E2

**Detects:** a root `package.json` without a `test` script.

**Why:** `npm test` is one explicit command for the repository test suite. A
test workflow that must be assembled from local knowledge cannot be verified
consistently.

**Fix:** add a root `test` script that runs the complete suite. Cargo and one
.NET project root already have `cargo test` and `dotnet test <project>`; a
Python root needs `[tool.pytest]` configuration. Multiple root .NET projects
need one selected solution. Unknown layouts produce explicit E1/E2 findings at
the repository root rather than guessed commands.

---

## `line-length` - 80 preferred, 120 hard

**Detects:** characters per line.

**Why 80 is a preferred diagnostic signal:** side-by-side diffs, split editor
panes, and terminal review often assume it. It can also act as a complexity
signal - a line past 80 characters may be doing two things.

**Why 120 is a stronger diagnostic signal:** past that, wrapping is often
unavoidable somewhere. It still points to review rather than proving that a
line is incorrect or that reformatting alone is useful.

**Fix:** *Extract Variable* for a long expression - the name is documentation.
Break long parameter lists one per line. Never fix this by reformatting alone
in a file you have not otherwise touched, and never before wave 6.

---

## `comment-bloat` - a comment that outweighs its own declaration

**Detects:** a block of five or more standalone comment lines. It fires when
that count is more than twice (preferred) or four times (hard) the lines of
code below it. The subject is the run of code lines under the block. That run
stops at the first blank line, or at a line that only closes a bracket.

**Why the ratio and not the length:** ten lines over a forty-line function is
an explanation. Ten lines over a one-line field is an essay. Length alone
would punish the first and miss the point of the second. The ratio remains a
review signal, not a ban on long explanations.

**Why preferred:** the comment is read every time the code is. The reader
pays for it every time. Some blocks recount the bug that prompted the line,
name the value it used to hold, or walk through an experiment. Git already
records all of that, so the toll may buy nothing; inspect intent before
deleting context.

**Fix:** keep the sentence that gives a reason a reader could not derive.
Delete the history, the changelog, and the rejected alternative. Delete the
walkthrough of what the code plainly does. Move a measurement table into the
test that produced it. An explanation that truly needs the length is a signal.
Name the code under it better, or split it.

**Not reported:** a comment with no code under it - a file header, a licence,
a section banner - and a comment above a `package`, `import` or `use` line.
Neither has a declaration to be measured against.

---

## `comment-restates-code` - a comment that says the name again

**Detects:** a comment of one or two lines. It fires when three quarters or
more of the comment's content words also appear in the three code lines below
it. Both sides are split on camelCase and snake_case, then stemmed.
`/** Parse a markdown file from disk. */` over `parseMarkdown(filePath)`
matches.

**Why preferred:** the declaration already states the what, and it cannot go
stale. A comment that repeats it adds a second copy that can. It also trains
the reader to skip comments in this file, including the ones that matter.

**Fix:** delete it, or replace it with the why - the constraint, the reason
for this value, the caller this shape exists for. If nothing can be said, the
name is the documentation and no comment is needed.

---

## `todo-marker` - TODO / FIXME / HACK / XXX

**Detects:** those words in any comment.

**Why preferred:** a marker is a decision deferred to a reader who has less
context than the author did. Most are never resolved.

**Fix:** do it now if it is small, file an issue and reference it by URL if it
is not, or delete the marker if it no longer applies. A marker with a ticket
link is legitimate; a bare `// TODO: handle this` is not.

---

## `test-quality` - explicit T1-T9 evidence

`quality-guard test-quality` is a report-only evidence pass for Clean Code
Chapter 17's T1-T9 test guidance. It does not infer test intent, domain
boundaries, bug scope, runtime failure clusters, or acceptable timing from
source syntax. A `.quality/test-quality.json` manifest must declare behavior and
boundary IDs with input/expected oracles, active tests, optional coverage
observations, explicit uncovered behavior links, bug links, failure signatures,
and timing budgets before the related signal is meaningful.

The pass reports missing behavior tests (T1), missing per-source coverage
evidence (T2), missing trivial documentary tests (T3), ambiguity skips (T4),
missing declared boundary tests (T5), missing tests for linked bug behavior
(T6), repeated runtime failure clusters (T7), explicitly linked uncovered
regions overlapping a failure (T8), and tests over an environment-specific
budget (T9). Findings are
review evidence with a remediation, never deterministic commit failures.

Coverage is a gap signal. A percentage does not prove behavior quality, and a
missing provider report is `unavailable`, not zero. The manifest normalizes
C#, Python, TypeScript, and Rust language names so the metrics remain
comparable without pretending their providers or test runners are identical.

# Rule Reference

One section per scanner rule: what it measures, why the bound is where it is,
how to fix it, and how it can be wrong. Refactoring names in *italics* are from
Fowler's catalog - see `catalog.md`.

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

**False positives:** functions referenced only inside a plain string
literal, in any language but Rust. Rare.

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
was an error it marked whole test harnesses for deletion. It now warns, and the
ratchet still stops the count from rising.

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

**Why hard at 2 sites:** the second occurrence is where duplication becomes a
maintenance hazard, because now a fix can be applied to one and not the other.
Waiting for a third occurrence means shipping the bug that the third occurrence
would have revealed.

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

**Why hard, and only hard:** the bound is 1, with no preferred tier, because
there is no "mostly one type." The rule is what makes a codebase navigable
without search: a type's file is its name. It also makes diffs, blame, and
merge conflicts track a single concept.

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

**Why these numbers:** 100 lines is roughly what fits in one screen and one
head. 300 is where a reader stops building a mental model and starts using
search. Beyond that the file is a directory that forgot to become one.

**Fix:** the split has to follow a real seam - *Extract Class*, *Extract
Function* into a new module, or *Split Phase* when the file does two things in
sequence. If no seam exists, a long cohesive file is better than two files that
must always change together. Say so and leave it.

---

## `function-length` - 30 preferred, 60 hard

**Detects:** lines from signature to closing brace (or dedent, in Python).

**Why:** the *Long Method* smell. A function longer than a screen cannot be
verified by reading; it can only be trusted.

**Fix:** *Extract Function* - but extract a **concept**, not a line range. If
you cannot name the extracted function without referring to its position
("part two", "step three", "helper"), the split is in the wrong place.

---

## `complexity` - 5 preferred, 10 hard

**Detects:** cyclomatic complexity, counted as 1 plus each `if`, `for`,
`while`, `case`, `catch`, `&&`, `||`, `??`, ternary, and (in Rust) `match` arm.

**Why 10 hard:** at complexity 10 a function has at least 10 independent paths,
which is roughly where exhaustive testing stops being practical and where
readers reliably start missing a branch.

**Why 5 preferred:** most functions that do one thing land at 1 - 4. A function
at 6 is usually two functions.

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

**Why:** each level is a condition the reader has to hold. Depth 5 means five
simultaneous conditions to understand the innermost line.

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

**Why 7:** the *Long Parameter List* smell. Past a handful, call sites become
positional puzzles and every insertion is a breaking change no compiler
catches when the types happen to match.

**Why 3 preferred:** most functions that need four arguments are being handed a
*Data Clump* - a group of values that always travel together and want to be a
type.

**Fix:**

- *Introduce Parameter Object* for a data clump.
- *Preserve Whole Object* when you are passing three fields of the same object.
- *Replace Parameter with Query* when the callee can derive the value.
- *Remove Flag Argument* for booleans - a boolean parameter means the function
  is two functions.

---

## `unnamed-tuple` - tuple types

**Detects:** named and unnamed tuple types in supported type positions:
TypeScript `: [A, B]` and `[first: A, second: B]`; C# `(int, string)` and
`(int first, string second)` return types; Rust `-> (A, B)`; Python
`-> Tuple[A, B]`.

**Why hard:** `result.0` and `result[1]` carry no meaning, so every call site
re-derives what the fields are. Adding or reordering a field silently breaks
every destructuring that still compiles.

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

## `line-length` - 80 preferred, 120 hard

**Detects:** characters per line.

**Why 80 preferred:** side-by-side diffs, split editor panes, and terminal
review all assume it. It also acts as a complexity signal - a line past 80
characters is usually doing two things.

**Why 120 hard:** past that, wrapping is unavoidable somewhere, and wrapped
lines are read wrong.

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
would punish the first and miss the point of the second.

**Why preferred:** the comment is read every time the code is. The reader
pays for it every time. Some blocks recount the bug that prompted the line,
name the value it used to hold, or walk through an experiment. Git already
records all of that, so the toll buys nothing.

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

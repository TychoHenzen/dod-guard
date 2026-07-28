# Smell → Refactoring Catalog

Lookup table for the judgment pass. Smell names follow refactoring.guru's
taxonomy; refactoring names follow Fowler's catalog (refactoring.com/catalog).

## How to use this

You found something that feels wrong. Name the smell, then apply the named
refactoring. Naming both matters: a step description that says "Replace Nested
Conditional with Guard Clauses in `evaluateProof`" produces a predictable diff,
and "clean up `evaluateProof`" produces a rewrite.

---

## Bloaters

| Smell | What you see | Refactorings |
|---|---|---|
| **Long Method** | Function past 30 lines, does several things | Extract Function · Replace Temp with Query · Introduce Parameter Object · Decompose Conditional · Replace Function with Command |
| **Large Class** | File past 300 lines, many fields | Extract Class · Extract Superclass · Replace Type Code with Subclasses |
| **Primitive Obsession** | `string` for an id, `[a, b]` for a pair, int for an enum | Replace Primitive with Object · Replace Type Code with Subclasses · Introduce Parameter Object · Replace Magic Literal |
| **Long Parameter List** | 4+ parameters | Introduce Parameter Object · Preserve Whole Object · Replace Parameter with Query · Remove Flag Argument |
| **Data Clumps** | The same 3 values passed together everywhere | Extract Class · Introduce Parameter Object · Preserve Whole Object |

## Object-Orientation Abusers

| Smell | What you see | Refactorings |
|---|---|---|
| **Switch Statements** | `switch`/`if-else` on a type code, repeated in several places | Replace Conditional with Polymorphism · Replace Type Code with Subclasses · Introduce Special Case · Remove Flag Argument |
| **Temporary Field** | A field set only during one operation | Extract Class · Introduce Special Case · Replace Function with Command |
| **Refused Bequest** | Subclass throws on, or ignores, inherited members | Replace Subclass with Delegate · Replace Superclass with Delegate · Push Down Method / Field |
| **Alternative Classes with Different Interfaces** | Two types doing the same job, different names | Change Function Declaration · Move Function · Extract Superclass |

## Change Preventers

| Smell | What you see | Refactorings |
|---|---|---|
| **Divergent Change** | One file changed for unrelated reasons | Extract Class · Split Phase · Move Function |
| **Shotgun Surgery** | One change touches many files | Move Function · Move Field · Combine Functions into Class · Inline Class |
| **Parallel Inheritance Hierarchies** | Adding a subclass forces a second subclass elsewhere | Move Function · Move Field · collapse one hierarchy |

## Dispensables

| Smell | What you see | Refactorings |
|---|---|---|
| **Dead Code** | Unreachable or uncalled | Remove Dead Code |
| **Duplicate Code** | Same block twice | Extract Function · Pull Up Method · Parameterize Function · Slide Statements · Substitute Algorithm |
| **Lazy Class** | A class that does almost nothing | Inline Class · Collapse Hierarchy |
| **Speculative Generality** | Abstractions with one implementation, unused hooks | Collapse Hierarchy · Inline Class · Inline Function · Change Function Declaration (drop unused params) · Remove Dead Code |
| **Data Class** | Fields and accessors, no behavior — *and callers manipulate it* | Move Function (behavior in) · Encapsulate Record · Encapsulate Collection |
| **Comments** | A comment explaining *what* the next block does | Extract Function (name it instead) · Extract Variable · Introduce Assertion |

**Note on Data Class:** this smell and the `stateless-method` rule pull in
opposite directions, and the resolution is the point. A type whose *callers*
reach in and manipulate its fields wants behavior moved in. A type whose own
methods never touch its fields wants those methods moved out. Both are asking
for the same thing: put each operation where its data is.

## Couplers

| Smell | What you see | Refactorings |
|---|---|---|
| **Feature Envy** | A method mostly uses another object's data | Move Function · Extract Function then Move Function |
| **Inappropriate Intimacy** | Two classes reaching into each other's internals | Move Function · Move Field · Extract Class · Hide Delegate · Replace Subclass with Delegate |
| **Message Chains** | `a.b().c().d()` | Hide Delegate · Extract Function · Move Function |
| **Middle Man** | A class that only delegates | Remove Middle Man · Inline Function |
| **Incomplete Library Class** | You need a method the library lacks | Move Function into a wrapper · extension function |

---

## Refactorings, by what they do

Fowler's catalog, grouped for lookup. Alternate names in parentheses.

**Composing functions**
Extract Function (Extract Method) · Inline Function (Inline Method) ·
Extract Variable (Introduce Explaining Variable) · Inline Variable (Inline Temp) ·
Change Function Declaration (Add/Remove Parameter, Rename Function) ·
Combine Functions into Class · Combine Functions into Transform ·
Split Phase · Replace Inline Code with Function Call · Slide Statements

**Encapsulation**
Encapsulate Variable (Encapsulate Field, Self-Encapsulate Field) ·
Encapsulate Record (Replace Record with Data Class) · Encapsulate Collection ·
Replace Primitive with Object (Replace Data Value with Object, Replace Type Code
with Class) · Replace Temp with Query · Extract Class · Inline Class ·
Hide Delegate · Remove Middle Man · Substitute Algorithm

**Moving features**
Move Function (Move Method) · Move Field · Move Statements into Function ·
Move Statements to Callers · Replace Loop with Pipeline · Split Loop ·
Remove Dead Code

**Simplifying conditionals**
Decompose Conditional · Consolidate Conditional Expression ·
Replace Nested Conditional with Guard Clauses ·
Replace Conditional with Polymorphism · Introduce Special Case (Introduce Null
Object) · Introduce Assertion · Replace Control Flag with Break

**Simplifying calls**
Separate Query from Modifier · Parameterize Function · Remove Flag Argument
(Replace Parameter with Explicit Methods) · Preserve Whole Object ·
Replace Parameter with Query · Replace Query with Parameter ·
Remove Setting Method · Replace Constructor with Factory Function ·
Replace Function with Command (Replace Method with Method Object) ·
Replace Command with Function · Return Modified Value ·
Replace Error Code with Exception · Replace Exception with Precheck ·
Replace Magic Literal · Split Variable (Remove Assignments to Parameters) ·
Rename Variable · Rename Field · Replace Derived Variable with Query

**Inheritance**
Pull Up Method · Pull Up Field · Pull Up Constructor Body · Push Down Method ·
Push Down Field · Extract Superclass · Collapse Hierarchy ·
Replace Type Code with Subclasses (Extract Subclass, Replace Type Code with
State/Strategy) · Remove Subclass (Replace Subclass with Fields) ·
Replace Subclass with Delegate · Replace Superclass with Delegate (Replace
Inheritance with Delegation) · Change Reference to Value · Change Value to
Reference

---

## SOLID, operationally

Each principle, the observable symptom, and the refactoring that resolves it.

| Principle | Symptom you can actually see | Refactoring |
|---|---|---|
| **Single Responsibility** | The file's job needs "and" to describe · it changes for unrelated reasons | Extract Class · Split Phase |
| **Open/Closed** | Adding a case means editing a `switch` in several files | Replace Conditional with Polymorphism · Replace Type Code with Subclasses |
| **Liskov Substitution** | A subclass throws on an inherited method, or a caller type-checks before calling | Replace Subclass with Delegate · Push Down Method |
| **Interface Segregation** | Implementors stub out half the interface | Extract Superclass · split the interface |
| **Dependency Inversion** | A policy module imports a concrete driver, database, or HTTP client | Extract Superclass (introduce the port) · Move Function |

**The order that matters:** SRP first. Most apparent OCP and DIP violations are
SRP violations that stopped being visible once the file got large enough. Split
the responsibility and the other two usually resolve without an abstraction
being introduced at all — which is the goal, because a speculative abstraction
is itself a smell.

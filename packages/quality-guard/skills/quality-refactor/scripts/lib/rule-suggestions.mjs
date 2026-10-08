// Default fix suggestions for structural findings that need a design decision.
// Each names the refactoring from reference/rules.md so that a reader of the
// finding alone knows the expected shape of the change. Cosmetic findings whose
// fix is obvious from the message carry no suggestion.

export const RULE_SUGGESTIONS = {
  "file-length":
    "Split along a real seam: Extract Class for each group of fields and the " +
    "methods that use them, Move Function for operations owned elsewhere, or " +
    "Split Phase for sequential stages. Do not split one class into partial " +
    "files; leave a cohesive file alone when no seam exists.",
  "partial-type-length":
    "A partial class is still one class. Merge the parts and Extract Class for " +
    "each cohesive group of fields and methods, or Move Function to the owner " +
    "of the data; keep the split only for a documented framework or generator " +
    "reason.",
  "function-length":
    "Extract Function for each named concept so the body reads as steps one " +
    "level below the function's name; if a part can only be named by its " +
    "position, the split is in the wrong place.",
  complexity:
    "Replace Nested Conditional with Guard Clauses first, then Decompose " +
    "Conditional, Consolidate Conditional Expression, or Replace Conditional " +
    "with Polymorphism for a type switch. Extract Function only last: two " +
    "always-sequential halves move complexity without removing it.",
  "nesting-depth":
    "Invert conditions into early returns or continues (Replace Nested " +
    "Conditional with Guard Clauses), then Extract Function for a deep loop body.",
  "param-count":
    "Introduce Parameter Object for values that travel together, Preserve " +
    "Whole Object when several come from one source, or Replace Parameter " +
    "with Query when the callee can derive one.",
  "types-per-file":
    "Move each additional top-level type into its own file named for the type; " +
    "group related types with a directory rather than a shared file.",
  "duplicate-block":
    "Extract Function for the shared behavior and Move Function it to the owner " +
    "both sites depend on; keep coincidental duplication that would couple " +
    "unrelated concepts.",
  "else-branch":
    "Handle the exceptional case first and return early so the main path is " +
    "unindented (Replace Nested Conditional with Guard Clauses).",
  "unnamed-tuple":
    "Replace Primitive with Object: declare a named record or struct whose " +
    "fields name each position.",
  "stateless-method":
    "Move it out of the class as a free function, extension method, or static " +
    "helper next to the data it does use.",
  "output-parameter":
    "Return the produced value, or a small named result type, instead of " +
    "writing through a parameter.",
  "flag-parameter":
    "Remove Flag Argument: split the behaviors into two named functions, or " +
    "replace the flag with a named option or strategy.",
  "dead-export":
    "Remove Dead Code: delete the symbol and its tests. If a manifest, " +
    "reflection, or dynamic import reaches it, record that caller instead.",
  "unused-local":
    "Remove Dead Code, unless a dynamic lookup or reflection reaches it.",
  "test-only-export":
    "Delete the symbol and its tests together, or call it from production code " +
    "if the behavior is genuinely needed.",
  "comment-bloat":
    "Keep the sentence that gives a reason a reader could not derive and move " +
    "the rest into a better name or an issue.",
};

export function suggestionFor(rule) {
  return RULE_SUGGESTIONS[rule];
}

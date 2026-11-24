// Some C# classes are built by an engine or container that finds them by
// attribute, so no scene or script references them. Godot does that for
// [GlobalClass], which is built in. A repository names its own such attributes
// (a dependency-injection [Service], say) in registeredAttributes.
const BUILT_IN_REGISTERED = ["GlobalClass"];
const ATTRIBUTE_SUFFIX = /Attribute$/;

// An attribute list item starts with its name: an optional target ("type:"), an
// optional namespace ("Godot."), the name and an optional "Attribute" suffix,
// then its arguments, the next item, or the end of the list. So [ServiceX] and
// typeof(Service) do not match.
function registeredPattern(names) {
  const bare = new Set(
    [...BUILT_IN_REGISTERED, ...names]
      .map((name) => name.replace(ATTRIBUTE_SUFFIX, ""))
      .filter(Boolean),
  );
  const alternatives = [...bare].join("|");
  return new RegExp(
    String.raw`(?:\[|,)\s*(?:\w+\s*:\s*)?(?:\w+\s*\.\s*)*` +
      String.raw`(?:${alternatives})(?:Attribute)?\s*(?=[(,\]])`,
  );
}

// Returns a test of whether the declaration at `index` carries a registered
// attribute. Only the text since the previous statement or brace counts, so a
// neighbour's attribute never leaks onto the next class.
export function registeredMatcher(names = []) {
  const pattern = registeredPattern(names);
  return (code, index) => {
    const before = code.slice(0, index);
    const cut = Math.max(
      before.lastIndexOf(";"),
      before.lastIndexOf("{"),
      before.lastIndexOf("}"),
    );
    return pattern.test(before.slice(cut + 1));
  };
}

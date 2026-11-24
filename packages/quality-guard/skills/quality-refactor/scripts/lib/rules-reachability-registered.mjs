// Some C# classes are built by an engine or container that finds them by
// attribute, so no scene or script references them. Godot does that for
// [GlobalClass], which is built in. A repository names its own such attributes
// (a dependency-injection [Service], say) in registeredAttributes.
//
// The code given here is the scanner's stripped code: comments and string
// contents are blanked, so a bracket or comma inside them never counts.
const BUILT_IN_REGISTERED = ["GlobalClass"];
const ATTRIBUTE_SUFFIX = /Attribute$/;
const SPACE = /\s/;
const WORD = /\w/;
const QUALIFIED_NAME = /^\w+(?:\s*(?:\.|::)\s*\w+)*$/;
const QUALIFIER = /\s*(?:\.|::)\s*/;
const ITEM_TARGET = /^(\w+)\s*:(?!:)/;
const NAME_END = /[(<]/;
// Modifiers that may stand between an attribute section and the "public" the
// export pattern matched, as in "[Service] static public class".
const MODIFIERS = new Set([
  "static",
  "sealed",
  "abstract",
  "partial",
  "unsafe",
  "new",
  "readonly",
  "ref",
]);
// An attribute on these targets applies to the assembly or module, not to the
// class declared below it.
const OTHER_TARGETS = new Set(["assembly", "module"]);

function bareName(name) {
  return name.replace(ATTRIBUTE_SUFFIX, "");
}

function skipSpace(code, at) {
  let i = at;
  while (i >= 0 && SPACE.test(code[i])) {
    i -= 1;
  }
  return i;
}

// The "[" that opens the section whose "]" is at `close`, or -1.
function sectionStart(code, close) {
  let depth = 0;
  for (let i = close; i >= 0; i -= 1) {
    if (code[i] === "]") {
      depth += 1;
    } else if (code[i] === "[") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function wordStart(code, end) {
  let i = end;
  while (i >= 0 && WORD.test(code[i])) {
    i -= 1;
  }
  return i + 1;
}

// Steps back over the attribute section or modifier that ends at `end`, and
// records a section's inside in `sections`. Returns where the step began, or
// -1 when the text there is neither.
function stepStart(code, end, sections) {
  if (code[end] === "]") {
    const open = sectionStart(code, end);
    if (open >= 0) {
      sections.push(code.slice(open + 1, end));
    }
    return open;
  }
  const start = wordStart(code, end);
  if (MODIFIERS.has(code.slice(start, end + 1))) {
    return start;
  }
  return -1;
}

// The inside of each attribute section directly above the declaration at
// `index`, walking back over whitespace and modifiers. Anything else, such as
// the ";" or "}" that ends the previous member, stops the walk, so a
// neighbour's attribute never reaches the next class.
function sectionsBefore(code, index) {
  const sections = [];
  let i = skipSpace(code, index - 1);
  while (i >= 0) {
    const start = stepStart(code, i, sections);
    if (start < 0) {
      break;
    }
    i = skipSpace(code, start - 1);
  }
  return sections;
}

const BRACKET_DEPTH = new Map([
  ["(", 1],
  ["[", 1],
  ["{", 1],
  [")", -1],
  ["]", -1],
  ["}", -1],
]);
const ANGLE_DEPTH = new Map([
  ["<", 1],
  [">", -1],
]);

// Splits a section at the commas between its items. A comma inside an
// argument list, as in [Tool(1, Service)], or inside generic arguments at the
// top level, as in [Handler<A, B>], separates no items. "<" and ">" count only
// outside brackets, where they cannot be comparison operators.
function sectionItems(section) {
  const items = [];
  let brackets = 0;
  let angles = 0;
  let start = 0;
  for (let i = 0; i < section.length; i += 1) {
    const ch = section[i];
    brackets += BRACKET_DEPTH.get(ch) ?? 0;
    if (brackets === 0) {
      angles += ANGLE_DEPTH.get(ch) ?? 0;
    }
    if (ch === "," && brackets === 0 && angles === 0) {
      items.push(section.slice(start, i));
      start = i + 1;
    }
  }
  items.push(section.slice(start));
  return items;
}

// The attribute's short name without its "Attribute" suffix, or null when the
// item is not one that applies to the class. "type: global::Godot.GlobalClassAttribute(1)"
// gives "GlobalClass".
function itemName(item) {
  let text = item.trim();
  const target = ITEM_TARGET.exec(text);
  if (target) {
    if (OTHER_TARGETS.has(target[1])) {
      return null;
    }
    text = text.slice(target[0].length).trim();
  }
  const name = text.split(NAME_END, 1)[0].trim();
  if (!QUALIFIED_NAME.test(name)) {
    return null;
  }
  return bareName(name.split(QUALIFIER).pop());
}

// Returns a test of whether the declaration at `index` carries a registered
// attribute.
export function registeredMatcher(names = []) {
  const registered = new Set(
    [...BUILT_IN_REGISTERED, ...names].map(bareName).filter(Boolean),
  );
  return (code, index) =>
    sectionsBefore(code, index).some((section) =>
      sectionItems(section).some((item) => registered.has(itemName(item))),
    );
}

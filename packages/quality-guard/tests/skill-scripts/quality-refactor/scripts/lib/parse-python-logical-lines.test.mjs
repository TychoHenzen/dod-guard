import assert from "node:assert/strict";
import { test } from "node:test";
import { maxNesting } from "#quality-guard-file-metrics";
import { findFunctions } from "#quality-guard-parse";
import { strip } from "#quality-guard-strip";

const ENDS_WITH_RETURN_NONE = /return None$/;
// Both literal samples open on line 1 and close on line 3.
const CLOSING_LINE = 3;
const LINES_INSIDE_LITERAL = [2, CLOSING_LINE];

function pythonFunctions(lines) {
  const source = lines.join("\n");
  return findFunctions(strip(source, "py"), "py", source);
}

function depths(lines) {
  return pythonFunctions(lines).map((fn) => [fn.name, maxNesting(fn)]);
}

test("a signature split over lines does not end the function", () => {
  const body = [
    "        if record:",
    "            for key in record:",
    "                with self.lock:",
    "                    if key:",
    "                        self.write(key)",
  ];
  const split = [
    "class Store:",
    "    def save(",
    "        self,",
    "        record,",
    "    ) -> None:",
    ...body,
  ];
  const oneLine = ["class Store:", "    def save(self, record) -> None:"];
  assert.deepEqual(depths(split), depths([...oneLine, ...body]));
});

test("a string closed left of the def does not end the function", () => {
  const source = [
    "class Reader:",
    "    def text(self):",
    "        value = '''",
    "first",
    "'''.strip()",
    "        if value:",
    "            return value",
    "        return None",
  ];
  const [reader] = pythonFunctions(source);
  assert.match(reader.body, ENDS_WITH_RETURN_NONE);
  assert.equal(maxNesting(reader), 1);
});

test("a backslash continuation adds no depth", () => {
  const source = [
    "def total(first, second):",
    "    value = first + \\",
    "            second",
    "    return value",
  ];
  assert.deepEqual(depths(source), [["total", 0]]);
});

test("indentation width does not change the depth", () => {
  const four = [
    "def walk(paths):",
    "    for path in paths:",
    "        if path:",
    "            print(path)",
  ];
  const two = four.map((line) => line.replaceAll("    ", "  "));
  assert.deepEqual(depths(two), [["walk", 2]]);
  assert.deepEqual(depths(four), [["walk", 2]]);
});

test("strip marks the lines that begin inside a literal", () => {
  const python = "x = '''\na\nb'''\ny = 1";
  const template = "const s = `\na\nb`;";
  // An interpolation that spans lines puts its second line back in code.
  const interpolation = ["const s = `$", "{\na}`;"].join("");
  const inside = (source, lang) => [...strip(source, lang).literalLines];
  assert.deepEqual(inside(python, "py"), LINES_INSIDE_LITERAL);
  assert.deepEqual(inside(template, "ts"), LINES_INSIDE_LITERAL);
  assert.deepEqual(inside(interpolation, "ts"), []);
});

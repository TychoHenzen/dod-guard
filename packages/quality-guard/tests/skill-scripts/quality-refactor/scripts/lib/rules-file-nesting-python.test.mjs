import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "#quality-guard-config";
import { maxNesting } from "#quality-guard-file-metrics";
import { findFunctions } from "#quality-guard-parse";
import { scanFile } from "#quality-guard-rules-file";
import { strip } from "#quality-guard-strip";

function depths(lang, lines) {
  const source = lines.join("\n");
  const found = findFunctions(strip(source, lang), lang, source);
  return found.map((fn) => [fn.name, maxNesting(fn)]);
}

function nestingFindings(lines) {
  const source = lines.join("\n");
  const file = { rel: "walk.py", lang: "py", isTest: false, source };
  return scanFile({ ...file, lines: source.split("\n") }, buildConfig())
    .violations.filter((violation) => violation.rule === "nesting-depth")
    .map(({ severity, message, metric }) => `${severity} ${metric} ${message}`);
}

const COPY_ALL = [
  "def copy_all(paths, target):",
  "    if paths:",
  "        for path in paths:",
  "            with open(path) as handle:",
  "                if handle.readable():",
  "                    target.write(handle.read())",
];

test("a call split over several lines adds no depth", () => {
  const source = [
    "def build(parser):",
    "    parser.add_argument(",
    '        "--root",',
    '        default=".",',
    '        help="repository root",',
    "    )",
    "    return parser",
  ];
  assert.deepEqual(depths("py", source), [["build", 0]]);
});

test("string items on continuation lines add no depth", () => {
  const source = [
    "def render(items):",
    "    return '\\n\\n'.join([",
    "                         'first paragraph of text',",
    "                         'second paragraph of text',",
    "                         f'third {items}',",
    "    ])",
  ];
  assert.deepEqual(depths("py", source), [["render", 0]]);
});

test("multi-line strings add no depth", () => {
  const source = [
    "def message(name):",
    '    text = """',
    "                                        indented text",
    '""".strip()',
    "    assert text == (",
    '        "line one "',
    '        "line two"',
    "    )",
    "    if name:",
    "        '                                '.join(name)",
    "    return text",
  ];
  assert.deepEqual(depths("py", source), [["message", 1]]);
});

test("a real if/for/with/if nest is still reported", () => {
  assert.deepEqual(nestingFindings(COPY_ALL), [
    "medium 4 copy_all() nests 4 levels deep",
  ]);
});

test("Python and TypeScript count the same nest the same", () => {
  const typescript = [
    "function copyAll(paths, target) {",
    "  if (paths) {",
    "    for (const path of paths) {",
    "      while (open(path)) {",
    "        if (readable(path)) {",
    "          target.write(path);",
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
  ];
  const [[, python]] = depths("py", COPY_ALL);
  assert.deepEqual(depths("ts", typescript), [["copyAll", python]]);
});

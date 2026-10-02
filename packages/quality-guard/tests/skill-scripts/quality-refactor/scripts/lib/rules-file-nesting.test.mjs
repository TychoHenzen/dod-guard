import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";

function nestingViolations(lang, source) {
  return scanFile(
    {
      rel: `strings.${lang}`,
      lang,
      isTest: false,
      source,
      lines: source.split("\n"),
    },
    buildConfig("default"),
  ).violations.filter((violation) => violation.rule === "nesting-depth");
}

const TS_TEMPLATE_SOURCE = [
  "    const template = `",
  "query { field(value: ",
  "$",
  "{value}) { nested } }",
  "`;",
].join("");

const STRING_FORM_CASES = [
  [
    "ts",
    [
      "function render(value) {",
      '    const ordinary = "{ ordinary }";',
      TS_TEMPLATE_SOURCE,
      "    return value;",
      "}",
    ].join("\n"),
  ],
  [
    "cs",
    [
      "class QueryClient {",
      "    string Render(string value) {",
      '        var ordinary = "{ ordinary }";',
      '        var raw = """',
      '            { "value": "{ nested }" }',
      '            """;',
      '        var interpolated = $"""',
      "            value: {value}",
      "            literal: {{ brace }}",
      '            """;',
      "        return value;",
      "    }",
      "}",
    ].join("\n"),
  ],
  [
    "rs",
    [
      "fn render(value: &str) -> &str {",
      '    let ordinary = "{ ordinary }";',
      '    let raw = r###"{ raw { nested } }"###;',
      "    value",
      "}",
    ].join("\n"),
  ],
];

test("Python GraphQL string forms do not inflate nesting", () => {
  const source = [
    "def fetch_repositories(client, owner):",
    '    ordinary = "{ ordinary }"',
    '    query = f"""',
    "                                            query Repositories($owner: String!) {",
    "                                                organization(login: {owner}) {",
    "                                                    repositories(first: 100) {",
    "                                                        nodes { name owner { login } }",
    "                                                    }",
    "                                                }",
    "                                            }",
    '    """',
    "    raw_query = r'''",
    "                                            query Raw { field { nested } }",
    "    '''",
    "    return client.execute(query, owner)",
  ].join("\n");

  assert.deepEqual(nestingViolations("py", source), []);
});

test("supported brace-based string forms do not create nesting findings", () => {
  for (const [lang, source] of STRING_FORM_CASES) {
    assert.deepEqual(nestingViolations(lang, source), [], lang);
  }
});

test("real nested control flow still reports its nesting metric", () => {
  const source = [
    "function deeplyNested(value) {",
    "    if (value) {",
    "        if (value) {",
    "            if (value) {",
    "                if (value) {",
    "                    if (value) {",
    "                        if (value) {",
    "                            return value;",
    "                        }",
    "                    }",
    "                }",
    "            }",
    "        }",
    "    }",
    "    return value;",
    "}",
  ].join("\n");

  assert.deepEqual(nestingViolations("ts", source), [
    {
      file: "strings.ts",
      line: 1,
      rule: "nesting-depth",
      severity: "error",
      message: "deeplyNested() nests 6 levels deep",
      metric: 6,
    },
  ]);
});

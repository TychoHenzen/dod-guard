import assert from "node:assert/strict";
import { test } from "node:test";
import { designFacts } from "../../../../../skills/quality-refactor/scripts/lib/design-smells/design-facts.mjs";

test("finds configuration-looking defaults across supported languages", () => {
  const fixtures = [
    ["service.ts", "class Service { run(timeout: number = 30) {} }"],
    ["Service.cs", "class Service { void Run(int timeout = 30) {} }"],
    [
      "service.py",
      "class Service:\n    def run(self, timeout=30):\n        return timeout\n",
    ],
  ];
  for (const [path, source] of fixtures) {
    assert.deepEqual(
      designFacts(
        source,
        path.split(".").at(-1) === "cs"
          ? "cs"
          : path.endsWith(".py")
            ? "py"
            : "ts",
      ).configurationDefaults,
      [
        {
          method: path.endsWith(".cs") ? "Run" : "run",
          parameter: "timeout",
          defaultValue: "30",
          line: path.endsWith(".py") ? 2 : 1,
        },
      ],
      path,
    );
  }
});

test("keeps commas inside quoted defaults", () => {
  assert.deepEqual(
    designFacts('class Service { run(url: string = "https://a,b") {} }', "ts")
      .configurationDefaults,
    [
      {
        method: "run",
        parameter: "url",
        defaultValue: '"https://a,b"',
        line: 1,
      },
    ],
  );
});

test("keeps Rust defaults intentionally inapplicable and ignores non-configuration values", () => {
  assert.deepEqual(
    designFacts("fn run(retries: Option<u32>) {}", "rs").configurationDefaults,
    [],
  );
  assert.deepEqual(
    designFacts("class Service { run(count: number = 3) {} }", "ts")
      .configurationDefaults,
    [],
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "./architecture-facts.mjs";

test(
  "shared facts normalize types, members, visibility, imports, and " +
    "references across brace languages",
  () => {
    const fixtures = [
      [
        "service.ts",
        `import { Clock } from "./clock"; export class Service { ` +
          "private clock: Clock; public run() { return this.clock.now(); } }",
      ],
      [
        "service.js",
        `import { Clock } from "./clock.js"; export class Service { ` +
          "#clock; run() { return this.#clock.now(); } }",
      ],
      [
        "Service.cs",
        "using Clocking; public class Service { private Clock clock; " +
          "public void Run() { clock.Now(); } }",
      ],
      [
        "Service.java",
        "import clock.Clock; public class Service { private Clock clock; " +
          "public void run() { clock.now(); } }",
      ],
      [
        "Service.kt",
        "import clock.Clock\nclass Service(private val clock: Clock) { " +
          "fun run() { clock.now() } }",
      ],
    ];
    for (const [path, content] of fixtures) {
      const result = extractArchitectureFacts({ path, content });
      assert.deepEqual(result.errors, [], path);
      assert.equal(result.facts.types[0]?.name, "Service", path);
      assert.ok(result.facts.imports.length > 0, path);
      assert.ok(
        result.facts.types[0]?.members.some(
          (member) => member.kind === "method",
        ),
        path,
      );
    }
  },
);
test("the shared facts contract handles Rust, Python, Go, C, and C++", () => {
  const fixtures = [
    [
      "service.rs",
      "use crate::clock::Clock; pub struct Service { clock: Clock } " +
        "impl Service { pub fn run(&self) { self.clock.now(); } }",
    ],
    [
      "service.py",
      "from clock import Clock\nclass Service:\n" +
        "    def __init__(self, clock: Clock):\n" +
        "        self.clock = clock\n    def run(self):\n" +
        "        return self.clock.now()\n",
    ],
    [
      "service.go",
      'package service\nimport "clock"\n' +
        "type Service struct { clock Clock }\n" +
        "func (s *Service) Run() { s.clock.Now() }",
    ],
    [
      "service.c",
      '#include "clock.h"\ntypedef struct Service { Clock *clock; } ' +
        "Service;\nvoid Service_run(Service *service) { " +
        "clock_now(service->clock); }",
    ],
    [
      "service.cpp",
      '#include "clock.hpp"\nclass Service { Clock* clock; ' +
        "public: void run() { clock->now(); } };",
    ],
  ];
  for (const [path, content] of fixtures) {
    const result = extractArchitectureFacts({ path, content });
    assert.deepEqual(result.errors, [], path);
    assert.equal(result.facts.types[0]?.name, "Service", path);
    assert.ok(result.facts.imports.length > 0, path);
  }
});

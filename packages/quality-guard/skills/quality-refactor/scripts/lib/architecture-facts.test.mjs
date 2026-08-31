import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeResponsibilityGrowth, extractArchitectureFacts } from "./architecture-facts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const beforeTypeScript = readFileSync(join(HERE, "target", "architecture-before.ts"), "utf8");
const afterTypeScript = readFileSync(join(HERE, "target", "architecture-after.ts"), "utf8");

// covers: quality-guard/architecture-analysis :: Responsibility growth carries concrete evidence :: Existing class gains a new dependency and operation
test("responsibility growth names the existing type, dependency, and added operation", () => {
  const result = analyzeResponsibilityGrowth(
    extractArchitectureFacts({ path: "src/invoice-service.ts", content: beforeTypeScript }),
    extractArchitectureFacts({ path: "src/invoice-service.ts", content: afterTypeScript }),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.findings, [
    {
      type: "InvoiceService",
      severity: "review",
      imports: ["./tax-calculator"],
      dependencies: ["TaxCalculator"],
      fields: ["calculator"],
      methods: ["calculateTax"],
      publicMembers: ["calculateTax"],
    },
  ]);
});

// covers: quality-guard/architecture-analysis :: Responsibility growth carries concrete evidence :: Method changes without structural growth
test("method-body edits do not create responsibility-growth findings", () => {
  const before = extractArchitectureFacts({ path: "src/invoice-service.ts", content: beforeTypeScript });
  const after = extractArchitectureFacts({
    path: "src/invoice-service.ts",
    content: beforeTypeScript.replace("return this.total.toString();", "return String(this.total);"),
  });
  assert.deepEqual(analyzeResponsibilityGrowth(before, after), { findings: [], errors: [] });
});

test("shared facts normalize types, members, visibility, imports, and references across brace languages", () => {
  const fixtures = [
    ["service.ts", `import { Clock } from "./clock"; export class Service { private clock: Clock; public run() { return this.clock.now(); } }`],
    ["service.js", `import { Clock } from "./clock.js"; export class Service { #clock; run() { return this.#clock.now(); } }`],
    ["Service.cs", `using Clocking; public class Service { private Clock clock; public void Run() { clock.Now(); } }`],
    ["Service.java", `import clock.Clock; public class Service { private Clock clock; public void run() { clock.now(); } }`],
    ["Service.kt", `import clock.Clock\nclass Service(private val clock: Clock) { fun run() { clock.now() } }`],
  ];
  for (const [path, content] of fixtures) {
    const result = extractArchitectureFacts({ path, content });
    assert.deepEqual(result.errors, [], path);
    assert.equal(result.facts.types[0]?.name, "Service", path);
    assert.ok(result.facts.imports.length > 0, path);
    assert.ok(result.facts.types[0]?.members.some((member) => member.kind === "method"), path);
  }
});

// covers: quality-guard/architecture-analysis :: Every finding is reproducible :: Required analysis cannot complete
test("a changed supported file that cannot yield required facts reports an explicit error", () => {
  const result = extractArchitectureFacts({ path: "src/broken.ts", content: "export class Broken {" });
  assert.equal(result.facts, null);
  assert.match(result.errors[0] ?? "", /cannot extract required architecture facts/i);
});

test("the shared facts contract handles Rust, Python, Go, C, and C++", () => {
  const fixtures = [
    ["service.rs", `use crate::clock::Clock; pub struct Service { clock: Clock } impl Service { pub fn run(&self) { self.clock.now(); } }`],
    ["service.py", `from clock import Clock\nclass Service:\n    def __init__(self, clock: Clock):\n        self.clock = clock\n    def run(self):\n        return self.clock.now()\n`],
    ["service.go", `package service\nimport "clock"\ntype Service struct { clock Clock }\nfunc (s *Service) Run() { s.clock.Now() }`],
    ["service.c", `#include "clock.h"\ntypedef struct Service { Clock *clock; } Service;\nvoid Service_run(Service *service) { clock_now(service->clock); }`],
    ["service.cpp", `#include "clock.hpp"\nclass Service { Clock* clock; public: void run() { clock->now(); } };`],
  ];
  for (const [path, content] of fixtures) {
    const result = extractArchitectureFacts({ path, content });
    assert.deepEqual(result.errors, [], path);
    assert.equal(result.facts.types[0]?.name, "Service", path);
    assert.ok(result.facts.imports.length > 0, path);
  }
});

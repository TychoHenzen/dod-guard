import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { lineIndex } from "../../../../../skills/quality-refactor/scripts/lib/offsets.mjs";
import { findFunctions } from "../../../../../skills/quality-refactor/scripts/lib/parse.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { strip } from "../../../../../skills/quality-refactor/scripts/lib/strip.mjs";
import { tsFile } from "./rules-file-fixtures.test.mjs";

const BLOCK = "{\n    return 1;\n  }"; // shared by the probe and long-return tests

// The raw source is the fourth argument, as the production callers pass it.
function functionsIn(source, lang = "ts") {
  const { code } = strip(source, lang);
  const found = findFunctions(code, lang, lineIndex(code), source);
  return found.map(({ name, body }) => ({ name, body }));
}

test("annotation-only members are not functions", () => {
  const members =
    "interface I { a(): { x: string }; b(): () => void; c(): Promise<() => void>; " +
    "d(): string; e(): A | { y: number }[]; }";
  assert.deepEqual(functionsIn(members), []);
  assert.deepEqual(functionsIn("interface I {\n  tag(): 'a' | 'b';\n}"), []);
});

test("the #678 probe does not run into the next class", () => {
  const probe =
    "interface Ctx { getOptions(): { getScratchDir(): { getAbsolutePath(): string } } }";
  const source = `${probe}\nclass Store {\n  load() {\n    return 1;\n  }\n}`;
  assert.deepEqual(functionsIn(source), [{ name: "load", body: BLOCK }]);
});

test("annotated methods, arrows and generics keep their real bodies", () => {
  const method =
    "class C {\n  n(): { a: string } { return { a: String(this.x) }; }\n}";
  assert.deepEqual(functionsIn(method), [
    { name: "n", body: "{ return { a: String(this.x) }; }" },
  ]);
  const arrow = functionsIn("const f = (v: number): number => v + 1;");
  assert.deepEqual(arrow, [{ name: "f", body: "v + 1" }]);
  const guard = functionsIn(
    "function g(x: unknown): x is string { return typeof x === 'string'; }",
  );
  assert.ok(guard[0].body.startsWith("{ return typeof x"));
  const generic =
    "class M {\n  m(): Map<string, Array<{ a: number }>> {\n    return new Map();\n  }\n}";
  assert.deepEqual(functionsIn(generic), [
    { name: "m", body: "{\n    return new Map();\n  }" },
  ]);
});

test("a block after a return type longer than 300 characters is found", () => {
  const fields = Array.from({ length: 20 }, (_, k) => `    field${k}: string;`);
  const source = `class Wide {\n  build(): {\n${fields.join("\n")}\n  } {\n    return 1;\n  }\n}`;
  assert.deepEqual(functionsIn(source), [{ name: "build", body: BLOCK }]);
});

test("import() type queries keep their name and block body", () => {
  // strip blanks the "rust" literal, so its six characters are spaces here.
  const repro = `export function createRustAdapter(
  options: LanguageAdapterOptions,
): import("./language-adapter-type.js").LanguageAdapter {
  return createLanguageAdapter("rust", options);
}`;
  const body = "{\n  return createLanguageAdapter(      , options);\n}";
  assert.deepEqual(functionsIn(repro), [{ name: "createRustAdapter", body }]);
  const variant = `export function build(): import("./x.js").Box<string>[] {
  return [];
}`;
  const block = "{\n  return [];\n}";
  assert.deepEqual(functionsIn(variant), [{ name: "build", body: block }]);
});

test("inputs that end inside an annotation or parameter list find nothing", () => {
  const inputs = ["m(): { a: string", "m(): Promise<", "m(): (", "m(a: string"];
  for (const input of inputs) {
    const source = `class K {\n  ${input}\n}`;
    assert.deepEqual(functionsIn(source), []);
    const result = scanFile(tsFile("src/k.ts", source), buildConfig());
    assert.deepEqual(result.functions, []);
    assert.ok(!result.violations.some((v) => v.rule === "stateless-method"));
  }
});

test("quoted literal return types keep their real block bodies", () => {
  const body = "{ return    ; }";
  const single = "class K {\n  kind(): 'a' | 'b' { return 'a'; }\n}";
  assert.deepEqual(functionsIn(single), [{ name: "kind", body }]);
  const double = 'class K {\n  k(): "x" { return "x"; }\n}';
  assert.deepEqual(functionsIn(double), [{ name: "k", body }]);
  assert.deepEqual(functionsIn("class K {\n  m(): 'a"), []);
});

test("C++ and C# constructors keep their bodies", () => {
  const cpp = functionsIn("Foo::Foo(int x) : m_x(x) { }", "cpp");
  assert.deepEqual(cpp, [{ name: "Foo", body: "{ }" }]);
  const cs = "class Foo {\n    public Foo(int x) : base(x) { }\n}";
  assert.deepEqual(functionsIn(cs, "cs"), [{ name: "Foo", body: "{ }" }]);
});

test("parenthesized return types keep the arrow function that follows them", () => {
  const h = "const h = (): (() => void) => () => { run(); };";
  assert.deepEqual(functionsIn(h), [{ name: "h", body: "() => { run(); }" }]);
  const k =
    "const k = (): ((a: number) => void) => (a) => { console.log(a); };";
  assert.deepEqual(functionsIn(k), [
    { name: "k", body: "(a) => { console.log(a); }" },
  ]);
  const s = "const s = (): (string | number) => 1;";
  assert.deepEqual(functionsIn(s), [{ name: "s", body: "1" }]);
});

test("a call in a ternary true branch keeps its plain body, not the ternary colon", () => {
  const w = "const w = c ? g() : () => { side(); };";
  assert.deepEqual(functionsIn(w), [{ name: "g", body: "{ side(); }" }]);
});

test("empty and object-typed function types in members are not functions", () => {
  assert.deepEqual(functionsIn("interface I { n(): () => void; }"), []);
  assert.deepEqual(
    functionsIn("interface I { m(): () => { a: string }; }"),
    [],
  );
  assert.deepEqual(
    functionsIn("type T = { m(): { a: string }, n(): () => void };"),
    [],
  );
});

test("a function type with a named parameter keeps its block body", () => {
  const source = "class A { m(): (a: number) => void { return; } }";
  assert.deepEqual(functionsIn(source), [{ name: "m", body: "{ return; }" }]);
});

test("a parenthesized single literal return type keeps the arrow body", () => {
  const source = "const s = (): ('a') => 1;";
  assert.deepEqual(functionsIn(source), [{ name: "s", body: "1" }]);
});

test("a parenthesized union of double-quoted literals keeps the arrow body", () => {
  const source = 'const t = (): ("a" | "b") => 2;';
  assert.deepEqual(functionsIn(source), [{ name: "t", body: "2" }]);
});

test("a parenthesized literal method return type has no body", () => {
  assert.deepEqual(functionsIn("interface I { m(): ('a'); }"), []);
});

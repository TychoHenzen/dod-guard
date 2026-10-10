import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import {
  csFile,
  rustFile,
  scanViolations,
  tsFile,
} from "./rules-file-fixtures.test.mjs";

// rules-file-fixtures.test.mjs has no Java, C++, or Python builder.
const fileOf = (lang) => (rel, code) => ({
  rel,
  lang,
  isTest: false,
  source: code,
  lines: code.split("\n"),
});
const javaFile = fileOf("java");
const cppFile = fileOf("cpp");
const pyFile = fileOf("py");

const stateless = (file) =>
  scanViolations(file).filter((v) => v.rule === "stateless-method");
const parsedNames = (file) =>
  scanFile(file, buildConfig()).functions.map((fn) => fn.name);
const NEVER_TOUCHES = /^greet\(\) never touches instance state/;

// Each template holds one method named greet; BODY is its return expression.
// Each field is declared in a form the scanner recognizes for that language:
// a visibility modifier for TypeScript, C#, and Java; a bare member for C++;
// a struct field for Rust.
const TS =
  'class Greeter {\n  private readonly prefix = "hi";\n  greet(name: string): string {\n    return BODY;\n  }\n}';
const CS =
  'class Greeter\n{\n    private string prefix = "hi";\n    public string greet(string name)\n' +
  "    {\n        return BODY;\n    }\n}";
const RS =
  "pub struct Greeter {\n    prefix: String,\n}\nimpl Greeter {\n" +
  "    pub fn greet(&self, name: &str) -> String {\n        BODY\n    }\n}";
const JAVA =
  'class Greeter {\n    private String prefix = "hi";\n    public String greet(String name) {\n' +
  "        return BODY;\n    }\n}";
const CPP =
  'class Greeter {\n    std::string prefix = "hi";\npublic:\n' +
  "    std::string greet(const std::string& name) {\n        return BODY;\n    }\n};";

// [file, builder, template, a body that never reads state, a body that reads the field]
const METHODS = [
  ["src/greeter.ts", tsFile, TS, "name.trim()", "this.prefix + name.trim()"],
  ["src/Greeter.cs", csFile, CS, "name.Trim()", "prefix + name.Trim()"],
  [
    "src/greeter.rs",
    rustFile,
    RS,
    "name.trim().to_string()",
    // biome-ignore lint/security/noSecrets: Rust format string, not a credential
    'format!("{}{}", self.prefix, name.trim())',
  ],
  ["src/Greeter.java", javaFile, JAVA, "name.trim()", "prefix + name.trim()"],
  ["src/greeter.cpp", cppFile, CPP, "name", "prefix + name"],
];

for (const [rel, build, template, free, reads] of METHODS) {
  const withBody = (body) => build(rel, template.replace("BODY", body));
  test(`${rel}: a method that never reads state is one stateless-method finding`, () => {
    const found = stateless(withBody(free));
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, "medium");
    assert.match(found[0].message, NEVER_TOUCHES);
  });
  test(`${rel}: the same method reading a declared field is quiet`, () => {
    const file = withBody(reads);
    assert.deepEqual(stateless(file), []);
    assert.ok(parsedNames(file).includes("greet"));
  });
}

test("src/panel.ts: a bodiless interface signature with an object-literal return type is not a method", () => {
  const file = tsFile(
    "src/panel.ts",
    "interface Panel {\n  title(): { text: string };\n}",
  );
  assert.deepEqual(stateless(file), []);
  assert.ok(!parsedNames(file).includes("title"));
});

test("src/greeter.py: a method that never touches self is quiet, because Python has no class spans", () => {
  const code =
    "class Greeter:\n    def greet(self, name):\n        return name.strip()";
  const file = pyFile("src/greeter.py", code);
  assert.deepEqual(stateless(file), []);
  assert.ok(parsedNames(file).includes("greet"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { markersInFile } from "./markers.js";

// covers: dod-guard/coverage-gate :: A scenario binds to a test through a marker in the test file :: A Python test file carries a covers marker above def test_
test("Python: # covers: above def test_ binds the scenario", () => {
  const content = [
    "# covers: eval/events :: ProbeTruth frozen :: difficulty defaults to None",
    "def test_probe_truth_difficulty_defaults_to_none():",
    '    truth = ProbeTruth(answer="42")',
    "    assert truth.difficulty is None",
  ].join("\n");
  const bindings = markersInFile("tests/test_events.py", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].scenarioId, "eval/events::ProbeTruth frozen||difficulty defaults to None");
  assert.equal(bindings[0].testName, "test_probe_truth_difficulty_defaults_to_none");
});

test("Python: async def test_ is recognized", () => {
  const content = ["# covers: mygroup/mycap :: req :: async scenario", "async def test_async_handler():"].join("\n");
  const bindings = markersInFile("test_async.py", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "test_async_handler");
});

// covers: dod-guard/coverage-gate :: A scenario binds to a test through a marker in the test file :: A Go test file carries a covers marker above func Test
test("Go: // covers: above func Test binds the scenario", () => {
  const content = [
    "// covers: mygroup/mycap :: Req1 :: Scen1",
    "func TestSomething(t *testing.T) {",
    "    assert.Equal(t, 1, 1)",
    "}",
  ].join("\n");
  const bindings = markersInFile("something_test.go", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].scenarioId, "mygroup/mycap::Req1||Scen1");
  assert.equal(bindings[0].testName, "TestSomething");
});

test("Rust: // covers: above #[test] then fn binds the scenario", () => {
  const content = [
    "// covers: mygroup/mycap :: req :: rust scenario",
    "#[test]",
    "fn test_it_works() {",
    "    assert_eq!(1, 1);",
    "}",
  ].join("\n");
  const bindings = markersInFile("lib.rs", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "test_it_works");
});

test("Rust: pub async fn after #[test] is recognized", () => {
  const content = [
    "// covers: mygroup/mycap :: req :: async rust",
    "#[test]",
    "pub async fn test_async_thing() {",
  ].join("\n");
  const bindings = markersInFile("lib.rs", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "test_async_thing");
});

test("Rust: marker directly above fn without #[test] binds nothing", () => {
  const content = ["// covers: mygroup/mycap :: req :: missing attr", "fn test_no_attr() {"].join("\n");
  const bindings = markersInFile("lib.rs", content);
  assert.equal(bindings.length, 0);
});

// covers: dod-guard/coverage-gate :: A scenario binds to a test through a marker in the test file :: An unknown file extension is silently skipped
test("unknown extension returns zero bindings", () => {
  const content = "// covers: g/c :: r :: s\ntest('x', () => {});";
  assert.equal(markersInFile("data.csv", content).length, 0);
  assert.equal(markersInFile("readme.md", content).length, 0);
  assert.equal(markersInFile("config.txt", content).length, 0);
});

test("Java: // covers: above public void testX binds", () => {
  const content = ["// covers: mygroup/mycap :: req :: java direct", "public void testSomething() {"].join("\n");
  const bindings = markersInFile("MyTest.java", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "testSomething");
});

test("Java: // covers: above @Test then method binds", () => {
  const content = [
    "// covers: mygroup/mycap :: req :: java annotated",
    "@Test",
    "public void shouldDoSomething() {",
  ].join("\n");
  const bindings = markersInFile("MyTest.java", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "shouldDoSomething");
});

test("shell: # covers: above test_ function binds", () => {
  const content = [
    "# covers: mygroup/mycap :: req :: shell scenario",
    "test_it_works() {",
    '    assertEquals "1" "1"',
    "}",
  ].join("\n");
  const bindings = markersInFile("run_tests.sh", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "test_it_works");
});

test("Ruby: # covers: above def test_ binds", () => {
  const content = ["# covers: mygroup/mycap :: req :: ruby def", "def test_something()"].join("\n");
  const bindings = markersInFile("test_thing.rb", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "test_something");
});

test("Ruby: # covers: above it block binds", () => {
  const content = ["# covers: mygroup/mycap :: req :: ruby it", 'it "does the right thing" do'].join("\n");
  const bindings = markersInFile("spec_thing.rb", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "does the right thing");
});

test("Kotlin: // covers: above fun testX binds", () => {
  const content = ["// covers: mygroup/mycap :: req :: kotlin", "fun testSomething() {"].join("\n");
  const bindings = markersInFile("MyTest.kt", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].testName, "testSomething");
});

test("scenario-id format with :: and || delimiters binds the same as spaced format", () => {
  const idFormat = [
    "# covers: eval/events::Event type union||isinstance dispatch",
    "def test_isinstance():",
    "    pass",
  ].join("\n");
  const spacedFormat = [
    "# covers: eval/events :: Event type union :: isinstance dispatch",
    "def test_isinstance():",
    "    pass",
  ].join("\n");
  const fromId = markersInFile("test_events.py", idFormat);
  const fromSpaced = markersInFile("test_events.py", spacedFormat);
  assert.equal(fromId.length, 1);
  assert.equal(fromSpaced.length, 1);
  assert.equal(fromId[0].scenarioId, fromSpaced[0].scenarioId);
});

test("nested capability path with scenario-id delimiters binds correctly", () => {
  const content = [
    "# covers: eval/generators/assoc::Config validation||distance below 1",
    "def test_distance_below_one():",
    "    pass",
  ].join("\n");
  const bindings = markersInFile("test_assoc.py", content);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].scenarioId, "eval/generators/assoc::Config validation||distance below 1");
});

test("JS: testBody extracts the brace-delimited body", () => {
  const content = [
    '// covers: g/c :: req :: scen',
    'test("my test", () => {',
    "  assert.equal(1, 1);",
    "});",
  ].join("\n");
  const bindings = markersInFile("foo.test.ts", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes("assert.equal(1, 1)"));
});

test("JS: testBody is undefined when no body follows marker", () => {
  const content = [
    '// covers: g/c :: req :: scen',
    "// just a comment, no test",
  ].join("\n");
  const bindings = markersInFile("foo.test.ts", content);
  assert.equal(bindings.length, 0);
});

test("Python: testBody extracts indent-delimited body", () => {
  const content = [
    "# covers: g/c :: req :: scen",
    "def test_something():",
    "    x = 1",
    "    assert x == 1",
    "",
    "def test_other():",
  ].join("\n");
  const bindings = markersInFile("test_it.py", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes("x = 1"));
  assert.ok(bindings[0].testBody!.includes("assert x == 1"));
});

test("Go: testBody extracts brace-delimited body", () => {
  const content = [
    "// covers: g/c :: req :: scen",
    "func TestThing(t *testing.T) {",
    "    t.Log(\"ok\")",
    "}",
  ].join("\n");
  const bindings = markersInFile("thing_test.go", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes('t.Log("ok")'));
});

test("Rust: testBody extracts body after #[test] fn", () => {
  const content = [
    "// covers: g/c :: req :: scen",
    "#[test]",
    "fn test_it() {",
    "    assert_eq!(1, 1);",
    "}",
  ].join("\n");
  const bindings = markersInFile("lib.rs", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes("assert_eq!(1, 1)"));
});

test("Rust: testBody returns null when #[test] is missing", () => {
  const content = [
    "// covers: g/c :: req :: scen",
    "fn not_a_test() {",
    "    assert_eq!(1, 1);",
    "}",
  ].join("\n");
  const bindings = markersInFile("lib.rs", content);
  assert.equal(bindings.length, 0);
});

test("Ruby: testBody extracts indent-delimited body for def test_", () => {
  const content = [
    "# covers: g/c :: req :: scen",
    "def test_something()",
    "  assert_equal 1, 1",
    "end",
  ].join("\n");
  const bindings = markersInFile("test_thing.rb", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes("assert_equal 1, 1"));
});

test("Java: testBody extracts brace body for direct void test method", () => {
  const content = [
    "// covers: g/c :: req :: scen",
    "public void testSomething() {",
    "    assertEquals(1, 1);",
    "}",
  ].join("\n");
  const bindings = markersInFile("MyTest.java", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes("assertEquals(1, 1)"));
});

test("Java: testBody extracts brace body for @Test annotated method", () => {
  const content = [
    "// covers: g/c :: req :: scen",
    "@Test",
    "public void shouldWork() {",
    "    assertTrue(true);",
    "}",
  ].join("\n");
  const bindings = markersInFile("MyTest.java", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes("assertTrue(true)"));
});

test("Shell: testBody extracts brace-delimited body", () => {
  const content = [
    "# covers: g/c :: req :: scen",
    "test_it_works() {",
    '    assertEquals "1" "1"',
    "}",
  ].join("\n");
  const bindings = markersInFile("run_tests.sh", content);
  assert.equal(bindings.length, 1);
  assert.ok(bindings[0].testBody);
  assert.ok(bindings[0].testBody!.includes('assertEquals "1" "1"'));
});

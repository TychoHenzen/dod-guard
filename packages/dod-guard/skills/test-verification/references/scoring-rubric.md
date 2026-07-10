# Test Quality Scoring — Objective Formulas

Each dimension scored 1-10 by deterministic formula from countable metrics. No LLM judgment in scoring. LLM role: fill classification checklist for metrics regex can't extract (context-dependent items like "is Date.now() mocked?" or "are fixtures per-test?").

Metrics extracted by static analysis (test-metrics.ts: regex patterns per language). Fields marked `[LLM]` require LLM classification.

---

## 1. Assertion Quality (weight ×2)

**Counts**:

- `test_function_count` — total test functions
- `total_assertions` — assertion statements (expect/assert/Assert)
- `specific_assertions` — assertions checking concrete values (NOT truthiness-only) — `[LLM: verify regex classification]`
- `truthiness_assertions` — `assert(x)`, `toBeDefined()`, `IsNotNull()`, `assert!(x)`, `assert.NotNil(t, x)` — [LLM: verify]
- `zero_assertion_functions` — test functions with zero assertions

**Formula**:
```
density     = min(3.5, (total_assertions / max(test_function_count, 1)) * 1.8)
specificity = min(4, (specific_assertions / max(total_assertions, 1)) * 4)
coverage    = min(2.5, ((test_function_count - max(0, zero_assertion_functions - 1)) / test_function_count) * 2.5)
score = 1 + density + specificity + coverage   // 1-10
```

**Truthiness assertion patterns** (detected by regex):

| Language | Pattern |
|----------|---------|
| JS/TS | `.toBeDefined()`, `.toBeUndefined()`, `.toBeTruthy()`, `.toBeFalsy()`, `.toBeNull()`, `assert(x)`, `assert.ok()`, `assert.isOk()` |
| Python | `assert x`, `assert x is not None`, `assert x is None`, `self.assertTrue(x)`, `self.assertFalse(x)`, `self.assertIsNotNone()` |
| Rust | `assert!(x)`, `assert!(!x)` — bare boolean without method call |
| C# | `Assert.IsTrue()`, `Assert.IsFalse()`, `Assert.IsNotNull()`, `Assert.IsNull()` |
| Go | `assert.True()`, `assert.False()`, `assert.NotNil()`, `assert.Nil()` |

**LLM task**: Review each line flagged as truthiness — is the assertion just a truthiness check, or does it actually verify a specific value? Reclassify if needed. Update `specific_assertions` and `truthiness_assertions` counts.

---

## 2. Determinism (weight ×2)

**Anti-pattern flags** (boolean, detected by regex):

| Flag | Detected by | LLM needed? |
|------|------------|-------------|
| `has_real_time` | `Date.now()`, `DateTime.Now`, `time.Now()`, `Instant::now()` | Yes — is it mocked? |
| `has_unseeded_random` | `Math.random()`, `Random()`, `rand::random()` | Yes — is it mocked? |
| `has_sleep` | `setTimeout()`, `time.Sleep()`, `Task.Delay()`, `Thread.Sleep()` | No |
| `has_real_filesystem` | `fs.readFile()`, `open()`, `File.Open()`, `os.Open()` | Yes — is it temp dir? |
| `has_real_network` | `fetch()`, `http.Get()`, `HttpClient`, `requests.get()` | Yes — is it mocked? |
| `has_real_database` | `sequelize`, `sqlalchemy`, `DbContext`, `sql.Open()` | Yes — is it mocked? |
| `has_shared_mutable_state` | Module-level `let`/`var`, `static mut`, static fields | Partial — verify it's test state |

**Formula**:
```
violations = count of TRUE flags (sleep + (shared_mutable * 0.5) + others)
score = max(2, 10 - violations * 1.3)
```

**LLM task**: For each flagged occurrence, check context — is the time/random/network call inside a mock setup (`jest.useFakeTimers()`, `vi.useFakeTimers()`, `mocker.patch()`)? If yes → clear the flag.

---

## 3. Isolation (weight ×1)

**Counts**:

- `has_setup_teardown` — `beforeEach`/`afterEach`/`SetUp`/`TearDown` present (detected by regex)
- `module_mutable_count` — module-level mutable variables (regex)
- `has_test_only` — `test.only`/`#[ignore]`/`[Ignore]`/`it.only` (regex)
- `creates_own_fixtures` — `[LLM: does each test create its own data?]`

**Formula**:
```
score = 7
  + (has_setup_teardown ? 1.5 : 0)
  - min(2, max(0, module_mutable_count - 2) * 0.75)
  - (has_test_only ? 2 : 0)
  + (creates_own_fixtures ? 1 : 0)
// clamp 1-10
```

**LLM task**: Read setup/teardown blocks — do they ACTUALLY reset state, or are they present but empty/ineffective? Check if each test creates its own fixtures vs sharing module-level ones.

---

## 4. Clarity (weight ×1)

**Counts**:

- `generic_names` — test functions with generic names: `test1`, `Test1`, `it('works')`, `test_function_name`, `TestMethod`, `TestSomething`, `test_basic` (regex)
- `has_aaa_markers` — `// Arrange` / `// Act` / `// Assert` comments present (regex)
- `magic_number_count` — bare numeric literals in assertions that aren't 0/1/-1/42/100/200/404/500 — `[LLM: verify — is "42" a meaningful constant?]`
- `multi_behavior_count` — `[LLM: tests with >5 assertions on unrelated things]`

**Formula**:
```
name_quality = (test_function_count - generic_names.length) / max(test_function_count, 1)
score = 2
  + min(3, name_quality * 3)
  + (has_aaa_markers ? 2 : 0)
  - min(2.5, max(0, magic_number_count - 1) * 0.5)
  - min(2, multi_behavior_count || 0)
// clamp 1-10
```

**Generic name patterns** (detected by regex):
- `test1`, `test_1`, `test_01`, `test_basic`, `test_simple`, `test_works`
- `it('works')`, `it('should work')`, `it('test')`
- `TestMethod`, `TestSomething` (bare prefix, no domain meaning)
- `def test_foo`, `def test_bar` (placeholder names)

**LLM task**: For each magic number — is this a well-known constant (HTTP status 200/404, answer to life 42) or a random value that should be named? Classify each as `well_known` or `should_be_named`. Count multi-behavior tests (tests asserting on >3 unrelated properties in a single test case).

---

## 5. Coverage Depth (weight ×2)

**Counts**:

- `error_path_functions` — tests that expect errors, test error handling, assert on thrown exceptions — [LLM: classify]
- `edge_case_functions` — `[LLM: tests targeting null/empty/zero input, boundary off-by-one, max/min values]`
- `happy_path_functions` — `[LLM: remaining tests — only valid/normal inputs]`

**Static hints for error detection** (regex):
- JS/TS: `.rejects`, `.toThrow()`, `assert.throws()`, test names containing "error"/"fail"/"invalid"/"throw"
- Python: `pytest.raises()`, `self.assertRaises()`, test names with "error"/"fail"/"raise"
- Rust: `#[should_panic]`, `.unwrap_err()`, `assert!(x.is_err())`, test names with "error"/"fail"/"panic"
- C#: `[ExpectedException]`, `Assert.Throws()`
- Go: `assert.Error()`, `if err != nil`, test names with "Error"/"Fail"

**Formula**:
```
score = 3  // base — happy-path-only tests still exercise something
  + min(5, (error_path_functions / max(test_function_count, 1)) * 8)
  + min(2, (edge_case_functions / max(test_function_count, 1)) * 4)
  + min(1, (total_assertions / max(test_function_count, 1)) > 3 ? 1 : (total_assertions / max(test_function_count, 1)) / 3)
// clamp 1-10
```

**LLM task**: Classify each test function as happy-path, error-path, or edge-case. Use static hints as starting point but verify by reading the test body. A test that wraps code in try/catch and asserts on the error IS error-path. A test that passes `null`/`[]`/`{}` as input IS edge-case.

---

## 6. Speed (weight ×1)

**Purely static — zero LLM needed.**

**Counts** (detected by regex):

| Pattern | Examples |
|---------|----------|
| `sleep_wait_count` | `setTimeout()`, `time.Sleep()`, `Task.Delay()`, `Thread.Sleep()`, `asyncio.sleep()`, `tokio::time::sleep()` |
| `real_io_count` | Filesystem + network + database calls (capped at 5) |

Mock library detection downgrades `real_io_count` to 0 if mocking library is present.

**Formula**:
```
violations = sleep_wait_count * 2 + real_io_count * 0.5
score = max(2, 10 - violations * 1.0)
```

---

## 7. Diagnostics (weight ×1)

**Mostly static — LLM needed for custom matchers only.**

**Counts**:

- `assertions_with_message` — assertions with custom message parameter (second-to-last arg is string) (regex)
- `assertions_without_message` — `total - messaged`
- `framework_shows_diff` — does the framework auto-show expected/actual on failure? (detected by framework presence: Jest/Vitest/pytest/assert_eq!/FluentAssertions/testify = YES; basic Assert = NO)
- `has_custom_matchers` — `[LLM: does the test file define custom assertion helpers or matchers?]`

**Formula**:
```
score = 2  // base — framework gives some diagnostics
  + min(4.5, (assertions_with_message / max(total, 1)) * 5.5)
  + (framework_shows_diff ? 2.5 : 0)
  + (has_custom_matchers ? 1 : 0)
// clamp 1-10
```

**LLM task**: Scan for custom matcher definitions (functions returning assertion results, Jest custom matchers, Python custom assertion helpers, etc.). Flag as boolean.

---

## 8. Assertion Triviality (weight ×1)

**Fully objective — zero LLM needed.** Already implemented in assertions.ts.

**Formula**:
```
If total_assertions === 0: score = 1
If trivial_assertions === 0: score = 10
Else: score = max(1, 10 - floor(trivial_assertions / total_assertions * 10))
```

**Trivial = constant-on-constant** — both sides of the assertion are literal constants. Detected by per-language regex (see assertions.ts patterns for Python, JS/TS, Rust, C#, Go).

---

## Overall Score

```
overall = (
  assertion_quality × 2 +
  determinism × 2 +
  isolation × 1 +
  clarity × 1 +
  coverage_depth × 2 +
  speed × 1 +
  diagnostics × 1 +
  assertion_triviality × 1
) / 11
```

---

## LLM Classification Output Schema

Agents return this JSON, NOT scores:

```json
{
  "file": "<path>",
  "classifications": {
    "truthiness_assertions_verified": <number — updated count after reclassifying>,
    "specific_assertions_verified": <number — updated count after reclassifying>,
    "real_time_mocked": <boolean — true if real time calls are inside mock setup>,
    "random_mocked": <boolean>,
    "filesystem_mocked": <boolean>,
    "network_mocked": <boolean>,
    "database_mocked": <boolean>,
    "creates_own_fixtures": <boolean>,
    "magic_numbers": <[{"line": N, "value": N, "classification": "well_known" | "should_be_named"}]>,
    "multi_behavior_count": <number — tests with >3 unrelated assertions>,
    "happy_path_functions": <number>,
    "error_path_functions": <number>,
    "edge_case_functions": <number>,
    "has_custom_matchers": <boolean>,
    "zero_assertion_functions": <number — verified count>
  },
  "findings": [
    {"severity": "high|medium|low", "category": "<dimension>", "location": "line N or fn name", "detail": "What's wrong", "suggestion": "How to fix"}
  ],
  "summary": "<one sentence>"
}
```

**Finding generation rules**:
- Severity is formula-driven: score ≤ 3 → high, score 4-5 → medium, score 6-7 → low, score ≥ 8 → no finding
- Each finding cites the specific metric causing the low score (e.g., "truthiness_assertions: 8 out of 10 assertions check only existence, not values")
- Maximum 3 findings per dimension
- Findings must reference concrete counts, not subjective judgments

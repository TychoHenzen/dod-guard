---
name: test-integrity-checker
description: >-
  Detects and fixes LLM-written tests that bless production code bugs instead of
  catching them. Audits for logic mirroring (test reimplements same algorithm as
  code), output blessing (assertion values derived from buggy output), weak
  assertions (toBeDefined/toBeTruthy), mock-everything vacuously-passing tests,
  symmetry/inverse tests that cancel shared bugs, and missing negative/edge case
  coverage. Fixes tests to assert against known-correct expected values, not
  against what the code happens to produce. TRIGGER when: user says "check my
  tests", "are these tests real", "test integrity", "audit tests", "tests might
  be wrong", "review tests for bugs", "LLM wrote these tests", "test cop",
  "test bullshit detector", "verify test correctness", or describes suspecting
  tests were written to fit the code rather than the spec.
argument-hint: "[test file(s) or directory]"
compatibility: language-agnostic (works with any test framework)
---

# Test Integrity Checker

## Overview

LLMs write tests that fit production code. Given buggy code that returns 42
when it should return 24, the LLM writes `expect(result).toBe(42)`. Its tests
never catch bugs because they were written against the same buggy output.

This skill audits tests for that pattern — and fixes the ones that fail.

**Core insight:** A good test asserts against a known-correct expected value
derived from the spec, not against whatever the implementation happens to
produce. A test whose expected value would change if you fixed a bug in the
code is not a test — it's a second copy of the bug.

**Announce at start:** "Auditing test integrity — checking that tests catch
bugs, not bless them."

## When to Use vs Skip

### Use when:

- An LLM wrote both the implementation AND the tests (same model saw same bugs)
- Tests were written AFTER the implementation (author saw the output)
- Tests pass but you don't trust them
- Suspiciously high coverage with suspiciously simple tests
- Tests that all follow the same pattern (LLM template repetition)
- You found a bug that should have been caught by tests but wasn't
- Code review flags "tests look auto-generated"

### Skip when:

- Tests were written RED (before implementation, author never saw the code work)
- Tests were written by a different person/LLM than the implementation
- You have a verified spec/requirements to compare against (use adversarial-workflow Phase 2 instead)
- Trivial getters/setters with no logic to get wrong
- Test file is clearly a snapshot test (snapshot testing is its own category)

## The Problem: How LLM Tests Go Wrong

### Pattern 1: Output Blessing

```
1. LLM implements buggy code
2. LLM runs code, sees output "foo: 42, bar: 7"
3. LLM writes: expect(result).toBe("foo: 42, bar: 7")
4. Test passes. Bug persists forever.
```

The LLM didn't compute the correct answer. It observed the output and blessed it.

### Pattern 2: Logic Mirroring

```typescript
// Production code (buggy — off-by-one)
function average(nums: number[]): number {
  let sum = 0;
  for (let i = 0; i < nums.length; i++) {  // < not <= — last element skipped
    sum += nums[i];
  }
  return sum / nums.length;
}

// Test (same bug, different syntax)
test("average", () => {
  const nums = [1, 2, 3, 4];
  let sum = 0;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i];
  }
  const expected = sum / nums.length;  // computes 2.5, same as buggy code
  expect(average(nums)).toBe(expected);
});
```

The test computes expected value using the SAME algorithm. If the algorithm is
wrong, both produce the same wrong answer. The test verifies nothing.

### Pattern 3: Weak Assertions

```typescript
expect(result).toBeDefined();           // passes for ANY return value
expect(result).toBeTruthy();            // passes for anything non-null/non-zero/non-empty
expect(result).toBeInstanceOf(Array);   // passes for [] or [wrong, data]
expect(result.length).toBeGreaterThan(0); // passes for [garbage]
expect(func).not.toThrow();             // passes if it returns garbage instead of crashing
```

These tests provide false confidence. They check that code "did something" but
never verify it did the RIGHT thing.

### Pattern 4: Mock Everything

```typescript
test("processOrder", async () => {
  const mockDb = { save: vi.fn().mockResolvedValue({ id: 1 }) };
  const mockPayment = { charge: vi.fn().mockResolvedValue({ status: "ok" }) };
  const mockEmail = { send: vi.fn().mockResolvedValue(true) };

  await processOrder(order, mockDb, mockPayment, mockEmail);

  expect(mockDb.save).toHaveBeenCalled();     // tests that mocks were called
  expect(mockPayment.charge).toHaveBeenCalled();
  expect(mockEmail.send).toHaveBeenCalled();
});
```

Every dependency is mocked. The test verifies that code called its dependencies.
It does NOT verify that the right data flowed between them, that error states
are handled, or that the output is correct. If the code passes `undefined` to
`mockDb.save`, the test still passes.

### Pattern 5: Symmetry/Inverse Testing

```typescript
test("serialize-roundtrip", () => {
  const input = { name: "test", value: 42 };
  const serialized = serialize(input);
  const deserialized = deserialize(serialized);
  expect(deserialized).toEqual(input);  // passes even if both functions share bugs
});
```

If `serialize` drops fields and `deserialize` fills them with defaults,
round-trip passes but data is lost. If both functions share an encoding bug
(off-by-one on a delimiter), round-trip passes with wrong data.

### Pattern 6: Happy-Path-Only

A test file with 15 tests, all of which test normal inputs producing normal
outputs. Zero tests for: empty input, null/undefined, maximum values, invalid
types, error conditions, concurrent access, or partial failure.

### Pattern 7: Copy-Paste Parameterization

```typescript
// Every test is the same template with different values
test.each([
  [1, 2, 3],
  [4, 5, 9],
  [0, 0, 0],
  [-1, 1, 0],
])("add(%i, %i) = %i", (a, b, expected) => {
  expect(add(a, b)).toBe(expected);
});
```

The test cases were likely generated by asking the LLM "give me test cases."
The LLM picks obvious values that any implementation (buggy or not) would pass.
Missing: overflow, NaN, Infinity, large numbers, mixed types.

## The Three Phases

### Phase 1: AUDIT — Detect Integrity Problems

Dispatch the integrity auditor against the test file and its production code.

#### Step 1.1: Identify Targets

If the user specified files, use those. Otherwise, find them:

```bash
# Find test files
rg --files -g "*test*" -g "*spec*" -g "*Test*" -g "*Spec*" | sort

# For each test file, find its production code
# Look at imports, file naming conventions, or ask user
```

Group test files with their production code. Each group becomes one audit unit.

#### Step 1.2: Dispatch Auditor

For each test + production code pair, dispatch the integrity auditor:

```
Agent(
  subagent_type: "dod-guard:test-integrity-auditor",
  model: "sonnet",
  prompt: """
    Audit this test file for integrity problems. The production code is at
    [production_file_path]. The test file is at [test_file_path].

    Read BOTH files completely before evaluating.

    Check for these patterns:
    1. Logic mirroring — test computes expected values using same algorithm as production code
    2. Output blessing — assertion values that match the buggy output
    3. Weak assertions — toBeDefined, toBeTruthy, toBeInstanceOf, not.toThrow, length > 0
    4. Mock-everything — all dependencies mocked, tests verify calls not correctness
    5. Symmetry/inverse tests — round-trip tests that cancel shared bugs
    6. Happy-path-only — zero negative/edge/error tests
    7. Copy-paste parameterization — auto-generated test cases with obvious values only

    For each finding, cite exact file:line. Be specific about what's wrong and
    what the correct expected value SHOULD be.
  """
)
```

**Model diversity note:** If a different model wrote the tests, use a different
model for the auditor. If the same model wrote both code and tests, the auditor
MUST be a different model (same-model review is rubber-stamp). Follow the
model-diversity routing table from adversarial-workflow/SKILL.md.

If model diversity is unavailable, flag it in the audit report and run extra
verification on findings (manually compute correct expected values for at least
one finding to calibrate).

#### Step 1.3: Severity Classification

| Severity | Pattern | Why |
|----------|---------|-----|
| **critical** | Logic mirroring | Test literally cannot catch bugs in the algorithm |
| **critical** | Output blessing | Test was calibrated to buggy output |
| **major** | Mock-everything | Tests verify infrastructure, not behavior |
| **major** | Happy-path-only (core logic) | No edge/error coverage on critical path |
| **minor** | Weak assertions | Low confidence but not actively wrong |
| **minor** | Symmetry/inverse tests | Only wrong if both sides share bugs |
| **minor** | Happy-path-only (auxiliary) | Edge case gaps in non-critical code |
| **info** | Copy-paste parameterization | Weak coverage, not actively wrong |

### Phase 2: FIX — Rewrite Compromised Tests

For each confirmed finding, rewrite the test to assert against known-correct
values.

#### Fixing Logic Mirroring

Replace computed expected values with hardcoded correct values:

```typescript
// BEFORE (logic mirroring — computes expected using same algorithm)
test("average", () => {
  const nums = [1, 2, 3, 4];
  let sum = 0;
  for (let i = 0; i < nums.length; i++) sum += nums[i];
  const expected = sum / nums.length;
  expect(average(nums)).toBe(expected);
});

// AFTER (hardcoded correct expected value)
test("average", () => {
  expect(average([1, 2, 3, 4])).toBe(2.5);  // (1+2+3+4)/4 = 2.5
});
```

The correct expected value comes from:
1. Manual computation from the spec
2. A different computational approach (e.g., use `reduce` if implementation uses `for` loop)
3. Known test vectors (standard test cases for the domain)
4. A reference implementation (different library, different language, or online calculator)

**If you cannot determine the correct expected value,** flag this. A test
rewritten with another wrong value is worse than the original.

#### Fixing Output Blessing

Replace observed-output values with spec-derived values:

```typescript
// BEFORE (blesses whatever the code outputs)
test("formatUser", () => {
  expect(formatUser(user)).toBe("John (ID: 42, active)");  // matches buggy code
});

// AFTER (spec says: "Name (ID: N, STATUS)" where STATUS is "active" or "inactive")
test("formatUser", () => {
  expect(formatUser(activeUser)).toBe("John (ID: 42, active)");
});
```

If the output format is underspecified, flag it — you can't verify correctness
of an underspecified format.

#### Fixing Weak Assertions

Replace with specific value assertions:

```typescript
// BEFORE
expect(result).toBeDefined();
expect(result).toBeTruthy();

// AFTER
expect(result).toEqual({ name: "John", role: "admin", permissions: ["read", "write"] });
```

If the correct return value is unknown (no spec), the test itself is unfixable.
Flag it and add a TODO.

#### Fixing Mock-Everything

Two strategies:

1. **Add integration-level assertions** — after mock calls, verify the data
   passed to mocks is correct:
   ```typescript
   expect(mockDb.save).toHaveBeenCalledWith({
     id: order.id,
     items: order.items.map(i => ({ name: i.name, price: i.price })),
     total: 29.97,
   });
   ```

2. **Add at least one integration test** — a test that uses real dependencies
   (or realistic fakes) and verifies end-to-end behavior.

#### Fixing Symmetry/Inverse Tests

Add one-directional assertions that verify against known values:

```typescript
// Keep the round-trip test as a sanity check, ADD directional assertions
test("serialize produces correct format", () => {
  expect(serialize({ name: "test", value: 42 }))
    .toBe('{"name":"test","value":42}');
});

test("deserialize produces correct object", () => {
  expect(deserialize('{"name":"test","value":42}'))
    .toEqual({ name: "test", value: 42 });
});
```

#### Fixing Happy-Path-Only

Add tests for:
- Empty/null/undefined inputs
- Boundary values (0, -1, MAX_INT, empty string, max length)
- Error conditions (invalid types, missing required fields)
- Edge cases specific to the domain

### Phase 3: VERIFY — Confirm Fixes Are Real

#### Step 3.1: Verify Rewritten Tests Fail Against Buggy Code

For each rewritten test, temporarily inject a bug in the production code and
confirm the test fails. Remove the bug after verification.

```bash
# Example: verify test catches off-by-one in average()
# 1. Change `i < nums.length` to `i <= nums.length` in production
# 2. Run the rewritten test — MUST fail
# 3. Revert the change
# 4. Run the rewritten test — MUST pass
```

At minimum, verify one critical finding this way. If the rewritten test doesn't
fail against a known bug, the rewrite is wrong.

#### Step 3.2: Run Full Test Suite

```bash
npm test  # or equivalent
```

All original tests must still pass. Rewritten tests must pass.

#### Step 3.3: Line-Coverage Comparison

```bash
# Before and after coverage
npm test -- --coverage  # or equivalent
```

Coverage should not decrease. If it does, the rewrite dropped coverage of a code
path — restore it.

#### Step 3.4: Report

```markdown
## Test Integrity Audit — Complete

### Audited
- `src/utils/math.ts` + `src/utils/math.test.ts` (3 tests, 2 findings)
- `src/auth/login.ts` + `src/auth/login.test.ts` (8 tests, 1 finding)

### Fixed
| # | File | Severity | Pattern | Fix |
|---|------|----------|---------|-----|
| 1 | math.test.ts:12 | critical | Logic mirroring | Hardcoded expected value 2.5 |
| 2 | math.test.ts:28 | major | Weak assertion | Assert specific array contents |
| 3 | login.test.ts:45 | major | Mock-everything | Added data verification on mock calls |

### Flagged (unfixed)
| # | File | Severity | Pattern | Why unfixed |
|---|------|----------|---------|-------------|
| 4 | math.test.ts:35 | minor | Happy-path-only | Needs spec for edge case behavior |

### Before → After
- Tests audited: 11
- Integrity problems found: 4 (1 critical, 2 major, 1 minor)
- Fixed: 3
- Flagged for follow-up: 1
- Injected-bug verification: ✅ (1 critical finding verified)
- Test suite: ✅ PASS
- Coverage: 89% → 89% (unchanged)
```

## Rules

| Rule | Rationale |
|------|-----------|
| **Verify at least one critical fix against injected bug** | Proves the rewrite actually catches bugs. Without this, you've just rewritten the test to fit the same code a different way. |
| **Don't rewrite if you can't determine correct value** | A wrong expected value is worse than a mirrored one. Flag and move on. |
| **Keep original tests that are actually correct** | Not every test is wrong. Don't "fix" tests that were already asserting correct values. |
| **One test file at a time** | Audit → fix → verify per file. Don't batch unrelated test files. |
| **Coverage must not decrease** | If a rewrite drops coverage, you removed a code path from testing. |
| **Read both files completely before auditing** | Skimming misses the logic mirroring that spans both files. |
| **Cite file:line on every finding** | "This test looks weak" without evidence is rejected. |

## Integration with dod-guard

After fixing tests, create a DoD with holdout proofs to prevent regression:

```
dod_create(
  title: "test integrity holdout gates for <component>",
  goal: "Prevent test weakening — lock corrected test assertions as holdout proofs",
  type: "general",
  cwd: "<project root>",
  markdown_path: "<project root>/.dod/test-integrity-<component>.md",
  sections: {
    requirements: "Rewritten tests must maintain their corrected assertions",
  },
  roots: [
    {
      title: "Holdout gates",
      refinement: "draft",
      intent: "Holdout proofs lock the corrected test fingerprints",
      children: [
        {
          title: "<test name> assertion integrity",
          refinement: "concrete",
          command: "node -e \"const crypto = require('crypto'); const fs = require('fs'); const content = fs.readFileSync('<test file path>', 'utf8'); const hash = crypto.createHash('sha256').update(content).digest('hex'); console.log(hash);\"",
          predicate: { type: "output_contains", value: "<SHA-256 of corrected test>" },
          description: "Verify corrected test assertions haven't been weakened",
          category: "behavioral"
        }
      ]
    }
  ]
)
```

The holdout proof fingerprints the test file content. If a future LLM weakens
the test back to `expect(result).toBeDefined()`, the fingerprint changes and
the holdout fails.

**Important:** Only create holdout proofs for tests where:
- The correct expected value was manually verified
- The injected-bug verification confirmed the test catches bugs
- The test covers non-trivial logic

Don't holdout-lock trivial tests — it creates noise without protection.

## Shipped Agents

| Agent | File | Purpose |
|-------|------|---------|
| `test-integrity-auditor` | `agents/test-integrity-auditor.md` | Audits test files for logic mirroring, output blessing, weak assertions, mock-everything, symmetry/inverse tests, and missing edge coverage |

## Quick Reference: Detection Commands

### Find weak assertions
```bash
rg -n "toBeDefined|toBeTruthy|toBeFalsy|toBeInstanceOf|not\.toThrow|toBeNull|toBeUndefined" -g "*test*" -g "*spec*" --no-heading
```

### Find mock-everything tests (jest/vitest)
```bash
rg -n "vi\.fn\(\)|jest\.fn\(\)|mockResolvedValue|mockReturnValue" -g "*test*" -g "*spec*" --no-heading
```

### Find test files with no negative assertions
```bash
# Tests with toThrow or rejects — these have SOME error testing
# Tests without them likely have NO error testing
rg -L "toThrow|rejects|error|invalid|empty|null|undefined" -g "*test*" -g "*spec*"
```

### Find test files where all tests use .each (auto-generated template)
```bash
rg -l "test\.each|it\.each|describe\.each" -g "*test*" -g "*spec*"
```

## Platform Notes

- `rg` is cross-platform (Windows Git Bash + POSIX). Prefer it over `grep`/`findstr`.
- Test runner commands depend on the project. Auto-detect from package.json scripts.
- Path separators: `/` works in Git Bash and `rg` on all platforms.
- The injected-bug verification (Phase 3) uses `Edit` to temporarily break code,
  then reverts. Confirm the working tree is clean before starting.

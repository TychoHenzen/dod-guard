import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFullScenarioText } from "./scenario-text.js";

const SPEC = `# dod-guard/coverage-gate Specification

## Requirements

### Requirement: cover reports a scenario's state

Some requirement prose here.

#### Scenario: bound test found

- **WHEN** a test file carries a covers marker naming this scenario
- **THEN** cover reports the scenario as bound

#### Scenario: unwired scenario

- **WHEN** no test file carries a covers marker naming this scenario
- **THEN** cover reports the scenario as unwired

### Requirement: baseline comparison

#### Scenario: regression detected

- **GIVEN** a scenario was bound in the baseline
- **WHEN** cover now finds it unwired
- **THEN** the run exits with code 1
`;

describe("extractFullScenarioText", () => {
  it("extracts the full scenario block including heading and all bullets", () => {
    const result = extractFullScenarioText(SPEC, "bound test found");
    assert.ok(result);
    assert.ok(result.startsWith("#### Scenario: bound test found"));
    assert.ok(result.includes("**WHEN**"));
    assert.ok(result.includes("**THEN**"));
    assert.ok(result.includes("covers marker"));
  });

  it("stops at the next heading", () => {
    const result = extractFullScenarioText(SPEC, "bound test found");
    assert.ok(result);
    assert.ok(!result.includes("unwired scenario"));
  });

  it("extracts the last scenario before the next requirement heading", () => {
    const result = extractFullScenarioText(SPEC, "unwired scenario");
    assert.ok(result);
    assert.ok(result.includes("**THEN** cover reports the scenario as unwired"));
    assert.ok(!result.includes("regression detected"));
  });

  it("extracts a multi-bullet scenario", () => {
    const result = extractFullScenarioText(SPEC, "regression detected");
    assert.ok(result);
    assert.ok(result.includes("**GIVEN**"));
    assert.ok(result.includes("**WHEN**"));
    assert.ok(result.includes("**THEN**"));
  });

  it("returns undefined for a scenario that does not exist", () => {
    const result = extractFullScenarioText(SPEC, "nonexistent scenario");
    assert.equal(result, undefined);
  });
});

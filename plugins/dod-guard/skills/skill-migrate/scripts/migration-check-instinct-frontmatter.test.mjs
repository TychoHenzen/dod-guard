import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { run, useFixtures, writeInstinct } from "./harness/migration-check-harness.mjs";

describe("migration-check: instinct frontmatter", () => {
  const fx = useFixtures();

  it("instinct-frontmatter fails on a bad or absent confidence, naming confidence", () => {
    const tooHigh = writeInstinct(fx, "instinct-conf-high.md", { confidence: "1.5" });
    const outHigh = JSON.parse(run([tooHigh, "--kind=instinct", "--json"]).stdout);
    const checkHigh = outHigh.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkHigh.pass, false);
    assert.match(checkHigh.detail, /confidence/i);

    const notNumber = writeInstinct(fx, "instinct-conf-nan.md", { confidence: "abc" });
    const outNan = JSON.parse(run([notNumber, "--kind=instinct", "--json"]).stdout);
    const checkNan = outNan.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkNan.pass, false);
    assert.match(checkNan.detail, /confidence/i);

    const absent = writeInstinct(fx, "instinct-conf-absent.md", { confidence: undefined });
    const outAbsent = JSON.parse(run([absent, "--kind=instinct", "--json"]).stdout);
    const checkAbsent = outAbsent.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkAbsent.pass, false);
    assert.match(checkAbsent.detail, /confidence/i);
  });

  it("instinct-frontmatter fails on a missing id, trigger, or domain, naming the field", () => {
    const noId = writeInstinct(fx, "instinct-no-id.md", { id: undefined });
    const outId = JSON.parse(run([noId, "--kind=instinct", "--json"]).stdout);
    const checkId = outId.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkId.pass, false);
    assert.match(checkId.detail, /id/i);

    const noTrigger = writeInstinct(fx, "instinct-no-trigger.md", { trigger: undefined });
    const outTrigger = JSON.parse(run([noTrigger, "--kind=instinct", "--json"]).stdout);
    const checkTrigger = outTrigger.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkTrigger.pass, false);
    assert.match(checkTrigger.detail, /trigger/i);

    const noDomain = writeInstinct(fx, "instinct-no-domain.md", { domain: undefined });
    const outDomain = JSON.parse(run([noDomain, "--kind=instinct", "--json"]).stdout);
    const checkDomain = outDomain.checks.find((c) => c.id === "instinct-frontmatter");
    assert.equal(checkDomain.pass, false);
    assert.match(checkDomain.detail, /domain/i);
  });
});

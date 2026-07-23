import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJudgeOutput } from "./judge.js";

// ── parseJudgeOutput ───────────────────────────────────────────────────

describe("parseJudgeOutput", () => {
  const validJson = JSON.stringify({
    winner_branch: "branch-a",
    scores: {
      "branch-a": { correctness: 8, clarity: 7, efficiency: 6, maintainability: 7 },
      "branch-b": { correctness: 5, clarity: 5, efficiency: 5, maintainability: 5 },
    },
    rationale: "branch-a handles edge cases better",
  });

  it("parses valid JSON verdict", () => {
    const verdict = parseJudgeOutput(validJson);
    assert.ok(verdict);
    assert.equal(verdict.winner_branch, "branch-a");
    assert.equal(verdict.scores["branch-a"].correctness, 8);
    assert.equal(verdict.scores["branch-a"].clarity, 7);
    assert.equal(verdict.scores["branch-a"].efficiency, 6);
    assert.equal(verdict.scores["branch-a"].maintainability, 7);
    assert.ok(verdict.rationale.includes("edge cases"));
  });

  it("parses JSON in markdown fences", () => {
    const output = `\`\`\`json\n${validJson}\n\`\`\``;
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.equal(verdict.winner_branch, "branch-a");
  });

  it("parses JSON without language tag in fences", () => {
    const output = `\`\`\`\n${validJson}\n\`\`\``;
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.equal(verdict.winner_branch, "branch-a");
  });

  it("extracts JSON block from surrounding text", () => {
    const output = `Some preamble text\n\n${validJson}\n\nSome trailing text`;
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.equal(verdict.winner_branch, "branch-a");
  });

  it("returns null for completely invalid output", () => {
    assert.equal(parseJudgeOutput("this is not json at all"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseJudgeOutput(""), null);
  });

  it("parses regex format (branch: correctness=n, clarity=n, ...)", () => {
    const output = [
      "branch-x: correctness=7, clarity=8, efficiency=6, maintainability=7",
      "branch-y: correctness=5, clarity=5, efficiency=5, maintainability=5",
      "winner branch: branch-x",
    ].join("\n");
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.ok(verdict.winner_branch === "branch-x" || verdict.scores["branch-x"] !== undefined);
    assert.equal(verdict.scores["branch-x"].correctness, 7);
    assert.equal(verdict.scores["branch-y"].efficiency, 5);
  });

  it("parses regex with colons instead of equals", () => {
    const output = ["branch-p: correctness: 9, clarity: 8, efficiency: 7, maintainability: 8"].join("\n");
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.equal(verdict.scores["branch-p"].correctness, 9);
  });

  it("picks winner by best composite when no explicit winner declared", () => {
    const output = [
      "good-branch: correctness=9, clarity=9, efficiency=9, maintainability=9",
      "bad-branch: correctness=3, clarity=3, efficiency=3, maintainability=3",
    ].join("\n");
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.equal(verdict.winner_branch, "good-branch");
  });

  it("handles decimal scores in regex format", () => {
    const output = "branch-z: correctness=7.5, clarity=8.2, efficiency=6.3, maintainability=7.1";
    const verdict = parseJudgeOutput(output);
    assert.ok(verdict);
    assert.equal(verdict.scores["branch-z"].clarity, 8.2);
  });

  it("rejects malformed verdict (missing scores)", () => {
    const badJson = JSON.stringify({ winner_branch: "x" });
    // Missing scores object
    assert.equal(parseJudgeOutput(badJson), null);
  });

  it("rejects verdict with missing dimension", () => {
    const badJson = JSON.stringify({
      winner_branch: "x",
      scores: { x: { correctness: 5, clarity: 5, efficiency: 5 } },
      // missing maintainability
      rationale: "test",
    });
    assert.equal(parseJudgeOutput(badJson), null);
  });

  it("handles JSON with nested braces in rationale", () => {
    const jsonWithBraces = JSON.stringify({
      winner_branch: "z",
      scores: {
        z: { correctness: 5, clarity: 5, efficiency: 5, maintainability: 5 },
      },
      rationale: "Uses {nested: true} patterns in code",
    });
    const verdict = parseJudgeOutput(jsonWithBraces);
    assert.ok(verdict);
    assert.equal(verdict.winner_branch, "z");
  });
});

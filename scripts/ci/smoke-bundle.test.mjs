import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { qualityGuardToolProblems } from "./smoke-bundle.mjs";

function tool(name, properties = {}) {
  return { name, inputSchema: { type: "object", properties } };
}

describe("smoke-bundle quality-guard tool contract", () => {
  it("accepts the three tools when none declares a profile input", () => {
    const tools = [tool("quality_report"), tool("quality_scan"), tool("quality_test_quality")];
    deepStrictEqual(qualityGuardToolProblems(tools), []);
  });

  it("reports a profile input declared by quality_scan", () => {
    const tools = [
      tool("quality_report"),
      tool("quality_scan", { path: { type: "string" }, profile: { type: "string" } }),
      tool("quality_test_quality"),
    ];
    deepStrictEqual(qualityGuardToolProblems(tools), ["quality_scan declares a retired profile input"]);
  });

  it("reports a profile input declared by quality_report", () => {
    const tools = [
      tool("quality_report", { profile: { type: "string" } }),
      tool("quality_scan"),
      tool("quality_test_quality"),
    ];
    deepStrictEqual(qualityGuardToolProblems(tools), ["quality_report declares a retired profile input"]);
  });

  it("reports a missing quality_test_quality tool", () => {
    const tools = [tool("quality_report"), tool("quality_scan")];
    deepStrictEqual(qualityGuardToolProblems(tools), ["missing required tool quality_test_quality"]);
  });
});

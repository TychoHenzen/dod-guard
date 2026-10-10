// Holds the quality-guard MCP tool contract that smoke-bundle.mjs enforces; side-effect free so tests can import it.
function missingToolProblems(byName) {
  const problems = [];
  for (const name of QUALITY_GUARD_TOOLS) {
    if (!byName.has(name)) {
      problems.push(`missing required tool ${name}`);
    }
  }
  return problems;
}

function profileProblems(byName) {
  const problems = [];
  for (const name of ["quality_report", "quality_scan"]) {
    const properties = byName.get(name)?.inputSchema?.properties ?? {};
    if (Object.hasOwn(properties, "profile")) {
      problems.push(`${name} declares a retired profile input`);
    }
  }
  return problems;
}

export const QUALITY_GUARD_TOOLS = ["quality_report", "quality_scan", "quality_test_quality"];

export function qualityGuardToolProblems(tools) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return [...missingToolProblems(byName), ...profileProblems(byName)];
}

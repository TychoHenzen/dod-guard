// markers.mjs - scan test files for `// covers:` markers and bind them to scenarios.
//
// Reimplements the marker regex from packages/dod-guard/src/cover/markers.ts.
// That file is the canonical source for the format.

import { promises as fs } from "node:fs";
import { join } from "node:path";

const MARKER_RE = /^\s*\/\/\s*covers:\s*(\S+\/\S+)\s*::\s*(.+?)\s*::\s*(.+?)\s*$/;
const TEST_CALL_RE = /^\s*(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;

function buildScenarioId(group, capability, requirementTitle, scenarioTitle) {
  return `${group}/${capability}::${requirementTitle}||${scenarioTitle}`;
}

function markersInFile(file, content) {
  const lines = content.split("\n");
  const bindings = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(MARKER_RE);
    if (!marker) continue;

    const [, groupCapability, requirementTitle, scenarioTitle] = marker;
    const slashIndex = groupCapability.indexOf("/");
    if (slashIndex === -1) continue;

    let next = i + 1;
    while (next < lines.length && lines[next].trim().length === 0) next++;
    const testCall = next < lines.length ? lines[next].match(TEST_CALL_RE) : null;
    if (!testCall) continue;

    bindings.push({
      scenarioId: buildScenarioId(
        groupCapability.slice(0, slashIndex),
        groupCapability.slice(slashIndex + 1),
        requirementTitle,
        scenarioTitle,
      ),
      file,
      testName: testCall[2],
    });
  }

  return bindings;
}

function testGlobsForGroup(group) {
  if (group === "openspec-dashboard") {
    return ["tools/openspec-dashboard/**/*.test.js", "tools/openspec-dashboard/**/*.test.mjs"];
  }
  return [`packages/${group}/src/**/*.test.ts`];
}

async function walkGlob(base, pattern) {
  const parts = pattern.split("/");
  let paths = [base];

  for (const part of parts) {
    const next = [];
    for (const dir of paths) {
      if (part === "**") {
        next.push(...(await collectDirs(dir)));
      } else if (part.includes("*")) {
        const re = new RegExp("^" + part.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (re.test(entry.name)) next.push(join(dir, entry.name));
          }
        } catch {}
      } else {
        next.push(join(dir, part));
      }
    }
    paths = next;
  }

  const result = [];
  for (const p of paths) {
    try {
      const stat = await fs.stat(p);
      if (stat.isFile()) result.push(p);
    } catch {}
  }
  return result;
}

async function collectDirs(dir) {
  const result = [dir];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
        result.push(...(await collectDirs(join(dir, entry.name))));
      }
    }
  } catch {}
  return result;
}

export { testGlobsForGroup };

export async function scanMarkers(projectPath, group) {
  const bindings = new Map();
  for (const pattern of testGlobsForGroup(group)) {
    for (const file of await walkGlob(projectPath, pattern)) {
      let content;
      try {
        content = await fs.readFile(file, "utf-8");
      } catch {
        continue;
      }
      for (const binding of markersInFile(file, content)) {
        bindings.set(binding.scenarioId, { testFile: binding.file, testName: binding.testName });
      }
    }
  }
  return bindings;
}

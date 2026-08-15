// project-reads.mjs - the reading side of the API, one function per view.
//
// Every result goes through the cache, keyed on the newest modification time
// under the project's openspec directory.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newestMtime } from "./cache.mjs";
import { scanMarkers } from "./markers.mjs";
import { parseTasks } from "./tasks.mjs";

const REQ_RE = /^###\s+Requirement:\s*(.+)/;
const SCENARIO_RE = /^####\s+Scenario:\s*(.+)/;

function parseSpecTitles(specFilePath) {
  let content;
  try {
    content = readFileSync(specFilePath, "utf-8");
  } catch {
    return [];
  }
  const requirements = [];
  let current = null;
  for (const line of content.split("\n")) {
    const reqMatch = line.match(REQ_RE);
    if (reqMatch) {
      current = { title: reqMatch[1].trim(), scenarios: [] };
      requirements.push(current);
      continue;
    }
    const scenarioMatch = line.match(SCENARIO_RE);
    if (scenarioMatch && current) {
      current.scenarios.push(scenarioMatch[1].trim());
    }
  }
  return requirements;
}

export function createReads({ read, cache }) {
  const ask = (project, key, args) =>
    cache.get(project.path, key, newestMtime(join(project.path, "openspec")), () =>
      read(project.path, args),
    );

  async function coverageForGroup(projectPath, group) {
    return cache.get(
      projectPath,
      `coverage:${group}`,
      newestMtime(join(projectPath, "openspec")),
      () => scanMarkers(projectPath, group),
    );
  }

  async function overview(project) {
    const [changes, specs] = await Promise.all([
      ask(project, "changes", ["list", "--json"]),
      ask(project, "specs", ["list", "--specs", "--json"]),
    ]);
    return { changes: changes.changes ?? [], specs: specs.specs ?? [] };
  }

  async function specDetail(project, id) {
    const spec = await ask(project, `spec:${id}`, ["show", id, "--json", "--type", "spec"]);
    const slashIndex = id.indexOf("/");
    if (slashIndex === -1) return { ...spec, coverage: {} };

    const group = id.slice(0, slashIndex);
    const capability = id.slice(slashIndex + 1);
    const specFilePath = join(project.path, "openspec", "specs", group, capability, "spec.md");
    const titles = parseSpecTitles(specFilePath);
    const bindings = await coverageForGroup(project.path, group);
    const coverage = {};

    const requirements = spec.requirements ?? [];
    for (let ri = 0; ri < requirements.length && ri < titles.length; ri++) {
      const scenarios = requirements[ri].scenarios ?? [];
      const scenarioTitles = titles[ri].scenarios;
      for (let si = 0; si < scenarios.length && si < scenarioTitles.length; si++) {
        const scenarioId = `${group}/${capability}::${titles[ri].title}||${scenarioTitles[si]}`;
        scenarios[si].scenarioId = scenarioId;
        const entry = bindings.get(scenarioId);
        if (entry) coverage[scenarioId] = entry;
      }
    }

    return { ...spec, coverage };
  }

  async function changeDetail(project, id) {
    const [detail, status] = await Promise.all([
      ask(project, `change:${id}`, ["show", id, "--json", "--type", "change"]),
      ask(project, `status:${id}`, ["status", "--change", id, "--json"]),
    ]);
    const tasks = parseTasks(join(project.path, "openspec", "changes", id, "tasks.md"));
    return { detail, artifacts: status.artifacts ?? [], tasks };
  }

  return { overview, specDetail, changeDetail };
}

// project-reads.mjs - the reading side of the API, one function per view.
//
// Every result goes through the cache, keyed on the newest modification time
// under the project's openspec directory.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { newestMtime } from "./cache.mjs";
import { scanMarkers, scanAllMarkers } from "./markers.mjs";
import { analyzeSpec } from "../../../scripts/ci/lib/obligation-count.mjs";
import { parseTasks } from "./tasks.mjs";

const REQ_RE = /^###\s+Requirement:\s*(.+)/;
const SCENARIO_RE = /^####\s+Scenario:\s*(.+)/;

async function parseSpecTitles(specFilePath) {
  let content;
  try {
    content = await readFile(specFilePath, "utf-8");
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

function specCoverage(specId, titles, bindings) {
  const slashIndex = specId.indexOf("/");
  if (slashIndex === -1) return { boundCount: 0, totalCount: 0 };
  const group = specId.slice(0, slashIndex);
  const capability = specId.slice(slashIndex + 1);
  let total = 0;
  let bound = 0;
  for (const req of titles) {
    for (const scenario of req.scenarios) {
      total++;
      if (bindings.get(`${group}/${capability}::${req.title}||${scenario}`)) bound++;
    }
  }
  return { boundCount: bound, totalCount: total };
}

function buildSpecTree(specs, coverageBySpec) {
  const root = {};
  for (const spec of specs) {
    const parts = spec.id.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    const cov = coverageBySpec.get(spec.id) ?? { boundCount: 0, totalCount: 0 };
    node[parts[parts.length - 1]] = {
      _leaf: true,
      id: spec.id,
      requirementCount: spec.requirementCount,
      boundCount: cov.boundCount,
      totalCount: cov.totalCount,
    };
  }
  return root;
}

async function resolveAllCoverage(projectPath, specList, allBindings) {
  const result = new Map();
  for (const spec of specList) {
    const slash = spec.id.indexOf("/");
    if (slash === -1) {
      result.set(spec.id, { boundCount: 0, totalCount: 0 });
      continue;
    }
    const group = spec.id.slice(0, slash);
    const capability = spec.id.slice(slash + 1);
    const specFilePath = join(projectPath, "openspec", "specs", group, capability, "spec.md");
    const titles = await parseSpecTitles(specFilePath);
    result.set(spec.id, specCoverage(spec.id, titles, allBindings));
  }
  return result;
}

async function computeSpecDetail(ctx) {
  const { project, id, stamp, read, coverageForGroup } = ctx;
  const spec = await read(project.path, ["show", id, "--json", "--type", "spec"]);
  const slashIndex = id.indexOf("/");
  if (slashIndex === -1) return { ...spec, coverage: {}, boundCount: 0, totalCount: 0 };

  const group = id.slice(0, slashIndex);
  const capability = id.slice(slashIndex + 1);
  const specFilePath = join(project.path, "openspec", "specs", group, capability, "spec.md");
  const titles = await parseSpecTitles(specFilePath);
  const obligations = analyzeSpec(specFilePath);
  const bindings = await coverageForGroup(project.path, group, stamp);
  const coverage = {};

  const requirements = spec.requirements ?? [];
  for (let ri = 0; ri < requirements.length && ri < titles.length; ri++) {
    const ob = obligations[ri];
    if (ob) requirements[ri].obligationCount = ob.obligationCount;
    const scenarios = requirements[ri].scenarios ?? [];
    const scenarioTitles = titles[ri].scenarios;
    for (let si = 0; si < scenarios.length && si < scenarioTitles.length; si++) {
      const scenarioId = `${group}/${capability}::${titles[ri].title}||${scenarioTitles[si]}`;
      scenarios[si].scenarioId = scenarioId;
      const entry = bindings.get(scenarioId);
      if (entry) coverage[scenarioId] = entry;
    }
  }

  const cov = specCoverage(id, titles, bindings);
  return { ...spec, coverage, boundCount: cov.boundCount, totalCount: cov.totalCount };
}

export function createReads({ read, cache }) {
  const ask = (project, key, args, stamp) =>
    cache.get(project.path, key, stamp, () => read(project.path, args));

  function coverageForGroup(projectPath, group, stamp) {
    return cache.get(projectPath, `coverage:${group}`, stamp, () => scanMarkers(projectPath, group));
  }

  function allMarkers(projectPath, stamp) {
    return cache.get(projectPath, "markers:all", stamp, () => scanAllMarkers(projectPath));
  }

  async function overview(project) {
    const stamp = await newestMtime(join(project.path, "openspec"));
    const [changes, specs, allBindings] = await Promise.all([
      ask(project, "changes", ["list", "--json"], stamp),
      ask(project, "specs", ["list", "--specs", "--json"], stamp),
      allMarkers(project.path, stamp),
    ]);
    const specList = specs.specs ?? [];
    const coverageBySpec = await resolveAllCoverage(project.path, specList, allBindings);
    const specTree = buildSpecTree(specList, coverageBySpec);
    return { changes: changes.changes ?? [], specs: specList, specTree };
  }

  async function specDetail(project, id) {
    const stamp = await newestMtime(join(project.path, "openspec"));
    return cache.get(project.path, `specView:${id}`, stamp, () =>
      computeSpecDetail({ project, id, stamp, read, coverageForGroup }),
    );
  }

  async function changeDetail(project, id) {
    const stamp = await newestMtime(join(project.path, "openspec"));
    const [detail, status] = await Promise.all([
      ask(project, `change:${id}`, ["show", id, "--json", "--type", "change"], stamp),
      ask(project, `status:${id}`, ["status", "--change", id, "--json"], stamp),
    ]);
    const tasks = await parseTasks(join(project.path, "openspec", "changes", id, "tasks.md"));
    return { detail, artifacts: status.artifacts ?? [], tasks };
  }

  return { overview, specDetail, changeDetail };
}

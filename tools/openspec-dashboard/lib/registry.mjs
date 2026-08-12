// registry.mjs - the list of projects the dashboard shows.
//
// A scan proposes candidates; this file decides what appears. The registry is
// the only thing the dashboard writes, and it lives outside every project.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const REGISTRY_DIR = join(homedir(), ".openspec-dashboard");
const REGISTRY_FILE = join(REGISTRY_DIR, "projects.json");

/** Directories worth searching, kept to the ones that exist on this machine. */
const ROOT_CANDIDATES = [
  "mcp-servers",
  "IdeaProjects",
  "RiderProjects",
  "PycharmProjects",
  "WebstormProjects",
  "CLionProjects",
  "RustroverProjects",
  "source",
  "projects",
  "dev",
  "repos",
];

const slash = (path) => resolve(path).replace(/\\/g, "/");

export function isProject(dir) {
  return existsSync(join(dir, "openspec"));
}

function entryFor(dir) {
  const path = slash(dir);
  return { name: basename(path), path };
}

function defaultRoots() {
  return ROOT_CANDIDATES.map((name) => join(homedir(), name)).filter(existsSync).map(slash);
}

/** With no file yet, offer the current directory when it is itself a project. */
function seed() {
  const cwd = process.cwd();
  return { roots: defaultRoots(), projects: isProject(cwd) ? [entryFor(cwd)] : [] };
}

function normalizeRegistry(parsed) {
  const roots = Array.isArray(parsed?.roots) && parsed.roots.length ? parsed.roots : defaultRoots();
  const projects = Array.isArray(parsed?.projects) ? parsed.projects.filter((p) => p?.path) : [];
  return { roots, projects };
}

function load() {
  try {
    return normalizeRegistry(JSON.parse(readFileSync(REGISTRY_FILE, "utf8")));
  } catch {
    return seed();
  }
}

function save(registry) {
  mkdirSync(REGISTRY_DIR, { recursive: true });
  writeFileSync(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

export function createStore() {
  let registry = load();
  return {
    get: () => registry,
    add(paths) {
      const known = new Set(registry.projects.map((p) => p.path));
      const added = paths.map(entryFor).filter((entry) => !known.has(entry.path));
      registry = save({ ...registry, projects: [...registry.projects, ...added] });
      return registry;
    },
    remove(path) {
      const target = slash(path);
      const projects = registry.projects.filter((p) => p.path !== target);
      registry = save({ ...registry, projects });
      return registry;
    },
  };
}

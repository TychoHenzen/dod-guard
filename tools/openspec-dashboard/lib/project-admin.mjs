// project-admin.mjs - the registry side of the API: list, scan, add, remove.

import { HttpError } from "./http-error.mjs";
import { isProject } from "./registry.mjs";
import { scan } from "./scan.mjs";
import { createHash } from "node:crypto";

function describe(project, id, projectExists) {
  return { id, name: project.name, path: project.path, readable: projectExists(project.path) };
}

function snapshot(projects, projectExists) {
  const entries = projects.map((project, id) => describe(project, id, projectExists));
  const registry_revision = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  return { projects: entries, registry_revision };
}

export function createAdmin(store, { isProject: projectExists = isProject } = {}) {
  const listProjects = () => snapshot(store.get().projects, projectExists);

  function selectLaunch(index, body) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.registry_revision !== "string" ||
      !/^[0-9a-f]{64}$/.test(body.registry_revision)
    ) {
      throw new HttpError(400, "invalid_launch_request");
    }

    const current = listProjects();
    if (body.registry_revision !== current.registry_revision) throw new HttpError(409, "stale_project_registry");
    if (!Number.isInteger(index) || index < 0 || index >= current.projects.length)
      throw new HttpError(404, "project_not_registered");
    const project = current.projects[index];
    if (!project.readable) throw new HttpError(410, "project_unavailable");
    return { name: project.name, path: project.path };
  }

  function pick(raw) {
    const project = store.get().projects[Number(raw)];
    if (!project) throw new HttpError(404, `no project registered at position ${raw}`);
    if (!isProject(project.path)) {
      throw new HttpError(410, `${project.path} no longer holds an openspec directory`);
    }
    return project;
  }

  function candidates() {
    const registry = store.get();
    const registered = new Set(registry.projects.map((project) => project.path));
    const found = scan(registry.roots).map((path) => ({ path, registered: registered.has(path) }));
    return { roots: registry.roots, candidates: found };
  }

  function mutate(body) {
    if (Array.isArray(body?.add)) store.add(body.add);
    if (typeof body?.remove === "string") store.remove(body.remove);
    return listProjects();
  }

  return { listProjects, pick, selectLaunch, candidates, mutate };
}

// project-admin.mjs - the registry side of the API: list, scan, add, remove.

import { HttpError } from "./http-error.mjs";
import { isProject } from "./registry.mjs";
import { scan } from "./scan.mjs";

function describe(project, id) {
  return { id, name: project.name, path: project.path, readable: isProject(project.path) };
}

export function createAdmin(store) {
  const listProjects = () => store.get().projects.map(describe);

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

  return { listProjects, pick, candidates, mutate };
}

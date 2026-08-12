// project-reads.mjs - the reading side of the API, one function per view.
//
// Every result goes through the cache, keyed on the newest modification time
// under the project's openspec directory.

import { join } from "node:path";
import { newestMtime } from "./cache.mjs";
import { parseTasks } from "./tasks.mjs";

export function createReads({ read, cache }) {
  const ask = (project, key, args) =>
    cache.get(project.path, key, newestMtime(join(project.path, "openspec")), () =>
      read(project.path, args),
    );

  async function overview(project) {
    const [changes, specs] = await Promise.all([
      ask(project, "changes", ["list", "--json"]),
      ask(project, "specs", ["list", "--specs", "--json"]),
    ]);
    return { changes: changes.changes ?? [], specs: specs.specs ?? [] };
  }

  const specDetail = (project, id) =>
    ask(project, `spec:${id}`, ["show", id, "--json", "--type", "spec"]);

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

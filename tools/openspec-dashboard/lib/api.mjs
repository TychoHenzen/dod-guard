// api.mjs - route a request to a reader or to the registry.
//
// A project is addressed by its position in the registry, never by a path the
// request carries. So no request can point the CLI at an arbitrary directory,
// even though every read spawns a child process.

import { HttpError } from "./http-error.mjs";
import { createAdmin } from "./project-admin.mjs";
import { createReads } from "./project-reads.mjs";

export function createApi({ read, cache, store, launchAdmission = () => true }) {
  const admin = createAdmin(store);
  const reads = createReads({ read, cache });

  function projectRoute(segments, query) {
    const project = admin.pick(segments[2]);
    if (query.get("refresh")) cache.clear(project.path);
    const id = segments[4] ? decodeURIComponent(segments[4]) : "";
    if (segments[3] === "overview") return reads.overview(project);
    if (segments[3] === "spec") return reads.specDetail(project, id);
    if (segments[3] === "change") return reads.changeDetail(project, id);
    throw new HttpError(404, `unknown project route: ${segments.slice(3).join("/")}`);
  }

  return async function handle(method, pathname, query, body) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[1] === "project" && segments[3] === "code-explorer" && segments.length === 4) {
      if (method !== "POST") throw new HttpError(400, "invalid_launch_request");
      if (!launchAdmission()) throw new HttpError(503, "dashboard_shutting_down");
      return admin.selectLaunch(Number(segments[2]), body);
    }
    if (segments[1] === "projects") return method === "POST" ? admin.mutate(body) : admin.listProjects();
    if (segments[1] === "scan") return admin.candidates();
    if (segments[1] === "project") return projectRoute(segments, query);
    throw new HttpError(404, `unknown route: ${pathname}`);
  };
}

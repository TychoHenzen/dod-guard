// api.mjs - route quality-report reads and registry operations.
//
// A project is addressed by its position in the registry, never by a path the
// request carries. So no request can point the CLI at an arbitrary directory,
// even though every read spawns a child process.

import { HttpError } from "./http-error.mjs";
import { launchResult } from "./launch-result.mjs";
import { createAdmin } from "./project-admin.mjs";
import { readQualityReport } from "./quality-report.mjs";

export function createApi({ store, launchAdmission = () => true, launchCodeExplorer, refreshQualityReport }) {
  const admin = createAdmin(store);

  function projectRoute(segments) {
    const project = admin.pick(segments[2]);
    if (segments[3] === "quality" && segments[4] === "refresh") {
      if (method !== "POST") throw new HttpError(400, "invalid_quality_refresh_request");
      if (!refreshQualityReport) throw new HttpError(503, "quality_refresh_unavailable");
      return refreshQualityReport(project.path);
    }
    if (segments[3] === "quality" && segments.length === 4) return readQualityReport(project.path);
    throw new HttpError(404, `unknown project route: ${segments.slice(3).join("/")}`);
  }

  return async function handle(method, pathname, query, body) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[1] === "project" && segments[3] === "code-explorer" && segments.length === 4) {
      if (method !== "POST") throw new HttpError(400, "invalid_launch_request");
      if (!launchAdmission()) throw new HttpError(503, "dashboard_shutting_down");
      return launchResult(async () => {
        const project = admin.selectLaunch(Number(segments[2]), body);
        if (!launchCodeExplorer) throw new HttpError(503, "code_explorer_unavailable");
        return launchCodeExplorer(project.path);
      });
    }
    if (segments[1] === "projects") return method === "POST" ? admin.mutate(body) : admin.listProjects();
    if (segments[1] === "scan") return admin.candidates();
    if (segments[1] === "project") return projectRoute(segments);
    throw new HttpError(404, `unknown route: ${pathname}`);
  };
}

// Distinguishes npm workspaces from Claude Code plugin workspaces. A package
// becomes a plugin only when it ships the manifest Claude Code loads.

import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { listDir } from "./fs-utils.mjs";

/** Lists every npm package with the shape shared by plugin validation checks. */
export function loadPackageWorkspaces(packagesDir) {
  return listDir(packagesDir, (entry) => statSync(entry).isDirectory())
    .map((name) => {
      const dir = join(packagesDir, name);
      return {
        name,
        dir,
        skills: listDir(join(dir, "skills"), (entry) => statSync(entry).isDirectory()),
        agents: listDir(join(dir, "agents"), (entry) => entry.endsWith(".md")).map((entry) => basename(entry, ".md")),
      };
    })
    .filter((workspace) => existsSync(join(workspace.dir, "package.json")));
}

/** Lists only package workspaces which declare themselves as loadable plugins. */
export function discoverPluginWorkspaces(packagesDir) {
  return loadPackageWorkspaces(packagesDir).filter((workspace) =>
    existsSync(join(workspace.dir, ".claude-plugin", "plugin.json")),
  );
}

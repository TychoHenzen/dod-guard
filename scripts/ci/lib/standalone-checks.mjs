// Checks for plugins that ship no code: a manifest plus an output style, and
// nothing else. They live under plugins/ rather than packages/, because they
// are not npm workspaces and none of the package.json rules apply to them.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { listDir, readFrontmatter } from "./fs-utils.mjs";

export function loadStandalonePlugins(root) {
  const dir = join(root, "plugins");
  return listDir(dir, (p) => statSync(p).isDirectory())
    .map((name) => ({
      name,
      dir: join(dir, name),
      styles: listDir(join(dir, name, "output-styles"), (p) => p.endsWith(".md")),
    }))
    .filter((plugin) => existsSync(join(plugin.dir, ".claude-plugin", "plugin.json")));
}

/** A style with broken frontmatter never reaches the picker, and says nothing there. */
function checkStyle(file, report) {
  const fields = readFrontmatter(file);
  if (!fields) return report(file, "missing or unterminated YAML frontmatter");
  if (!fields.name) report(file, "frontmatter has no name - the style cannot be selected by name");
  if (!fields.description) report(file, "frontmatter has no description - the picker would show nothing");
}

function checkManifest(file, name, report) {
  let declared;
  try {
    declared = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return report(file, `not valid JSON: ${err.message}`);
  }
  if (declared.name !== name) report(file, `name "${declared.name}" does not match directory "${name}"`);
  if (!declared.description) report(file, "description missing or empty");
}

export function checkStandalonePlugins(plugins, report) {
  for (const plugin of plugins) {
    checkManifest(join(plugin.dir, ".claude-plugin", "plugin.json"), plugin.name, report);
    if (plugin.styles.length === 0) {
      report(plugin.dir, "ships no output style and no package.json - nothing here reaches a user");
    }
    for (const style of plugin.styles) checkStyle(join(plugin.dir, "output-styles", style), report);
  }
  return plugins.reduce((n, p) => n + p.styles.length, 0);
}

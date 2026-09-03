// Checks for plugins that ship no code: a manifest plus directly loaded
// output styles, skills, or agents. They are not npm workspaces.

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
      skills: listDir(join(dir, name, "skills"), (p) => statSync(p).isDirectory()),
      agents: listDir(join(dir, name, "agents"), (p) => p.endsWith(".md")),
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

function checkNamedContent(file, expectedName, report) {
  const fields = readFrontmatter(file);
  if (!fields) return report(file, "missing or unterminated YAML frontmatter");
  if (fields.name !== expectedName) report(file, `frontmatter name "${fields.name}" does not match "${expectedName}"`);
  if (!fields.description) report(file, "frontmatter has no description");
}

export function checkStandalonePlugins(plugins, report) {
  for (const plugin of plugins) {
    checkManifest(join(plugin.dir, ".claude-plugin", "plugin.json"), plugin.name, report);
    if (plugin.styles.length + plugin.skills.length + plugin.agents.length === 0) {
      report(plugin.dir, "ships no output style, skill, or agent - nothing here reaches a user");
    }
    for (const style of plugin.styles) checkStyle(join(plugin.dir, "output-styles", style), report);
    for (const skill of plugin.skills) checkNamedContent(join(plugin.dir, "skills", skill, "SKILL.md"), skill, report);
    for (const agent of plugin.agents) {
      checkNamedContent(join(plugin.dir, "agents", agent), agent.replace(/\.md$/, ""), report);
    }
  }
  return {
    styleCount: plugins.reduce((n, p) => n + p.styles.length, 0),
    skillCount: plugins.reduce((n, p) => n + p.skills.length, 0),
    agentCount: plugins.reduce((n, p) => n + p.agents.length, 0),
  };
}

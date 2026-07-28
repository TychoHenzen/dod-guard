// Per-package plugin manifest checks: package.json, .mcp.json, plugin.json,
// skills, agents, and marketplace entries must all describe the same plugin.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { filesCovers, readFrontmatter, walkStrings } from "./fs-utils.mjs";

// biome-ignore lint/suspicious/noTemplateCurlyInString: this is Claude Code's literal placeholder syntax
const BUNDLE_ARG = "${CLAUDE_PLUGIN_ROOT}/dist/bundle.js";
const PLUGIN_ROOT_REF = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/g;
// Model names and built-in agents are legal subagent_type values with no agent file.
const BUILTIN_AGENTS = new Set(["sonnet", "opus", "haiku", "general-purpose", "Explore", "Plan", "claude"]);
// Double-encoded UTF-8 leaves these code points behind; U+FFFD means the file is not valid UTF-8.
// Built from code points so this file's own encoding cannot corrupt the detector.
const MOJIBAKE_CODES = [0x00c2, 0x00c3, 0x00e2, 0xfffd, 0xfeff];

function badCodePoint(text) {
  for (const char of text) {
    const code = char.codePointAt(0);
    const label = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    if (MOJIBAKE_CODES.includes(code)) return `mojibake / non-UTF-8 character ${label}`;
    if (code < 0x20 && code !== 0x0a && code !== 0x09) return `control character ${label}`;
  }
  return null;
}

export function createPluginChecks(report) {
  function readJson(file) {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      report(file, `not valid JSON: ${err.message}`);
      return null;
    }
  }

  function checkEncoding(file, json) {
    walkStrings(json, (text, path) => {
      const problem = badCodePoint(text);
      if (problem) report(file, `${problem} at ${path}: ${JSON.stringify(text.slice(0, 60))}`);
    });
  }

  /** Every "/slug" in a description must name a skill the plugin actually ships. */
  function checkSkillMentions(file, description, skills, label) {
    const mentioned = [...description.matchAll(/(?:^|\s|\()\/([a-z][a-z0-9-]{2,})/g)].map((m) => m[1]);
    for (const slug of new Set(mentioned)) {
      if (!skills.includes(slug))
        report(file, `${label} mentions /${slug} but no such skill ships (have: ${skills.join(", ") || "none"})`);
    }
    const claim = /Ships (\d+) skills?/.exec(description);
    if (claim && Number(claim[1]) !== skills.length) {
      report(file, `${label} claims ${claim[1]} skills but ${skills.length} ship`);
    }
  }

  function checkManifest(pkg, manifest) {
    const file = join(pkg.dir, "package.json");
    if (manifest.name !== pkg.name) report(file, `name "${manifest.name}" does not match directory "${pkg.name}"`);
    if (manifest.main !== "dist/bundle.js")
      report(file, `main must be dist/bundle.js, got ${JSON.stringify(manifest.main)}`);
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? ""))
      report(file, `version must be x.y.z, got ${JSON.stringify(manifest.version)}`);
    const wanted = `packages/${pkg.name}`;
    if (manifest.repository?.directory !== wanted) report(file, `repository.directory must be "${wanted}"`);
    if (!Array.isArray(manifest.files)) {
      report(file, "files[] missing — npm would publish the whole package directory");
      return;
    }
    for (const required of ["dist/bundle.js", ".mcp.json", ".claude-plugin/plugin.json"]) {
      if (!filesCovers(manifest.files, required)) report(file, `files[] does not ship ${required}`);
    }
    for (const dir of ["skills", "agents"]) {
      if (pkg[dir].length > 0 && !filesCovers(manifest.files, `${dir}/x`))
        report(file, `files[] does not ship ${dir}/ (${pkg[dir].length} present)`);
    }
  }

  function checkMcpConfig(pkg) {
    const file = join(pkg.dir, ".mcp.json");
    if (!existsSync(file)) return report(file, "missing — Claude Code cannot start the MCP server without it");
    const config = readJson(file);
    if (!config) return;
    checkEncoding(file, config);
    const servers = Object.keys(config.mcpServers ?? {});
    if (servers.length !== 1 || servers[0] !== pkg.name) {
      return report(file, `mcpServers must hold exactly one key named "${pkg.name}", got [${servers.join(", ")}]`);
    }
    const server = config.mcpServers[pkg.name];
    if (server.command !== "node") report(file, `command must be "node", got ${JSON.stringify(server.command)}`);
    if (server.args?.[0] !== BUNDLE_ARG)
      report(file, `args[0] must be "${BUNDLE_ARG}", got ${JSON.stringify(server.args?.[0])}`);
  }

  function checkHookTargets(pkg, file, plugin, manifest) {
    const commands = [];
    walkStrings(plugin.hooks ?? {}, (text, path) => {
      if (path.endsWith("command")) commands.push(text);
    });
    for (const command of commands) {
      for (const [, rel] of command.matchAll(PLUGIN_ROOT_REF)) {
        if (!existsSync(join(pkg.dir, rel))) report(file, `hook command targets missing file: ${rel}`);
        else if (Array.isArray(manifest.files) && !filesCovers(manifest.files, rel)) {
          report(join(pkg.dir, "package.json"), `files[] does not ship hook target ${rel}`);
        }
      }
    }
  }

  function checkPluginJson(pkg, manifest) {
    const file = join(pkg.dir, ".claude-plugin", "plugin.json");
    if (!existsSync(file)) return report(file, "missing — directory is not a loadable Claude Code plugin");
    const plugin = readJson(file);
    if (!plugin) return;
    checkEncoding(file, plugin);
    if (plugin.name !== pkg.name) report(file, `name "${plugin.name}" does not match package "${pkg.name}"`);
    if (!plugin.description?.trim()) report(file, "description missing or empty");
    else checkSkillMentions(file, plugin.description, pkg.skills, "plugin description");
    // plugin.json may omit version, but must never contradict package.json.
    if (plugin.version !== undefined && plugin.version !== manifest.version) {
      report(file, `version "${plugin.version}" disagrees with package.json "${manifest.version}"`);
    }
    checkHookTargets(pkg, file, plugin, manifest);
  }

  function checkSkills(pkg) {
    for (const skill of pkg.skills) {
      const file = join(pkg.dir, "skills", skill, "SKILL.md");
      if (!existsSync(file)) {
        report(file, "skill directory has no SKILL.md");
        continue;
      }
      const fields = readFrontmatter(file);
      if (!fields) report(file, "missing or unterminated YAML frontmatter");
      else if (fields.name !== skill)
        report(file, `frontmatter name "${fields.name}" does not match directory "${skill}"`);
      else if (!("description" in fields))
        report(file, "frontmatter has no description — the skill will never be triggered");
    }
  }

  function checkAgents(pkg) {
    for (const agent of pkg.agents) {
      const file = join(pkg.dir, "agents", `${agent}.md`);
      const fields = readFrontmatter(file);
      if (!fields) report(file, "missing or unterminated YAML frontmatter");
      else if (fields.name !== agent)
        report(file, `frontmatter name "${fields.name}" does not match filename "${agent}.md"`);
      else if (!("description" in fields)) report(file, "frontmatter has no description");
    }
  }

  /** Skills dispatch agents by "<plugin>:<agent>" — that target must exist. */
  function checkAgentReferences(pkg, packages) {
    for (const skill of pkg.skills) {
      const file = join(pkg.dir, "skills", skill, "SKILL.md");
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const [, ref] of text.matchAll(/subagent_type:\s*"([^"]+)"/g)) {
        if (BUILTIN_AGENTS.has(ref)) continue;
        const [ns, name] = ref.includes(":") ? ref.split(":") : [pkg.name, ref];
        const owner = packages.find((p) => p.name === ns);
        if (!owner) report(file, `subagent_type "${ref}" names unknown plugin "${ns}"`);
        else if (!owner.agents.includes(name))
          report(file, `subagent_type "${ref}" has no agent file packages/${ns}/agents/${name}.md`);
      }
    }
  }

  function checkMarketplace(file, packages, expectAll) {
    const market = readJson(file);
    if (!market) return;
    checkEncoding(file, market);
    if (!market.name?.trim()) report(file, "marketplace name missing");
    if (!Array.isArray(market.plugins) || market.plugins.length === 0)
      return report(file, "plugins[] missing or empty");
    const listed = new Set();
    for (const entry of market.plugins) {
      listed.add(entry.name);
      if (!entry.category?.trim()) report(file, `plugin "${entry.name}" has no category`);
      if (!entry.description?.trim()) report(file, `plugin "${entry.name}" has no description`);
      // marketplace source paths are relative to the repo root, not to .claude-plugin/
      const source = resolve(dirname(dirname(file)), entry.source ?? ".");
      const pluginJson = join(source, ".claude-plugin", "plugin.json");
      if (!existsSync(pluginJson)) {
        report(file, `plugin "${entry.name}" source ${entry.source} has no .claude-plugin/plugin.json`);
        continue;
      }
      const declared = readJson(pluginJson);
      if (declared && declared.name !== entry.name)
        report(file, `plugin "${entry.name}" points at source declaring name "${declared.name}"`);
      const pkg = packages.find((p) => p.name === entry.name);
      if (pkg && entry.description)
        checkSkillMentions(file, entry.description, pkg.skills, `plugin "${entry.name}" description`);
    }
    if (!expectAll) return;
    for (const pkg of packages) {
      if (!listed.has(pkg.name))
        report(file, `package ${pkg.name} is a plugin but is not listed in the root marketplace`);
    }
  }

  /** Run every per-package check for one plugin. */
  function checkPackage(pkg, packages) {
    const manifest = readJson(join(pkg.dir, "package.json"));
    if (!manifest) return;
    checkEncoding(join(pkg.dir, "package.json"), manifest);
    checkManifest(pkg, manifest);
    checkMcpConfig(pkg);
    checkPluginJson(pkg, manifest);
    checkSkills(pkg);
    checkAgents(pkg);
    checkAgentReferences(pkg, packages);
    const local = join(pkg.dir, ".claude-plugin", "marketplace.json");
    if (existsSync(local)) checkMarketplace(local, packages, false);
  }

  return { checkPackage, checkMarketplace };
}

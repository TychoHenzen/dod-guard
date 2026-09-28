// Per-package plugin manifest checks: package.json, .mcp.json, plugin.json,
// skills, and agents must all describe the same plugin. The repository has one
// marketplace at the root; package-level marketplaces create duplicate catalogs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readFrontmatter, walkStrings } from "./fs-utils.mjs";

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

export function createPluginChecks(report, isTracked) {
  function readJson(file, reportErrors = true) {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      if (reportErrors) report(file, `not valid JSON: ${err.message}`);
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
  function checkSkillMentions(file, description, pkg, label) {
    if (typeof description !== "string") {
      report(file, `${label} must be a string`);
      return;
    }
    const { skills, agents } = pkg;
    const mentioned = [...description.matchAll(/(?:^|\s|\()\/([a-z][a-z0-9-]{2,})/g)].map((m) => m[1]);
    for (const slug of new Set(mentioned)) {
      if (!skills.includes(slug))
        report(file, `${label} mentions /${slug} but no such skill ships (have: ${skills.join(", ") || "none"})`);
    }
    // Both phrasings ship today: "Ships 29 skills" and "MCP server and 29 skills".
    const claim = /(\d+) skills?\b/.exec(description);
    if (claim && Number(claim[1]) !== skills.length) {
      report(file, `${label} claims ${claim[1]} skills but ${skills.length} ship`);
    }
    const agentClaim = /(\d+)\s+agents?\b/i.exec(description);
    if (agentClaim && Number(agentClaim[1]) !== agents.length) {
      report(file, `${label} claims ${agentClaim[1]} agents but ${agents.length} ship`);
    }
  }

  function checkManifest(pkg, manifest) {
    const file = join(pkg.dir, "package.json");
    // npm shows this description too, so its skill count drifts the same way a manifest's does.
    checkSkillMentions(file, manifest.description ?? "", pkg, "package.json description");
    if (manifest.name !== pkg.name) report(file, `name "${manifest.name}" does not match directory "${pkg.name}"`);
    if (manifest.main !== "dist/bundle.js")
      report(file, `main must be dist/bundle.js, got ${JSON.stringify(manifest.main)}`);
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? ""))
      report(file, `version must be x.y.z, got ${JSON.stringify(manifest.version)}`);
    const wanted = `packages/${pkg.name}`;
    if (manifest.repository?.directory !== wanted) report(file, `repository.directory must be "${wanted}"`);
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
    // Literal string, not a template: this is the exact byte sequence every .mcp.json ships.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentionally literal, see comment above
    const expectedArg = "${CLAUDE_PLUGIN_ROOT}/dist/bundle.js";
    if (server.command !== "node") report(file, `command must be "node", got ${JSON.stringify(server.command)}`);
    if (server.args?.[0] !== expectedArg)
      report(file, `args[0] must be ${JSON.stringify(expectedArg)}, got ${JSON.stringify(server.args?.[0])}`);
  }

  function checkHookTargets(pkg, file, plugin) {
    const commands = [];
    walkStrings(plugin.hooks ?? {}, (text, path) => {
      if (path.endsWith("command")) commands.push(text);
    });
    for (const command of commands) {
      for (const [, rel] of command.matchAll(PLUGIN_ROOT_REF)) {
        const target = join(pkg.dir, rel);
        if (!existsSync(target)) report(file, `hook command targets missing file: ${rel}`);
        else if (isTracked && !isTracked(target)) {
          report(file, `hook command targets untracked file: ${rel}`);
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
    if (typeof plugin.description !== "string" || !plugin.description.trim()) report(file, "description missing or empty");
    else checkSkillMentions(file, plugin.description, pkg, "plugin description");
    // plugin.json may omit version, but must never contradict package.json.
    if (plugin.version !== undefined && plugin.version !== manifest.version) {
      report(file, `version "${plugin.version}" disagrees with package.json "${manifest.version}"`);
    }
    checkHookTargets(pkg, file, plugin);
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
        checkSkillMentions(file, entry.description, pkg, `plugin "${entry.name}" description`);
    }
    if (!expectAll) return;
    for (const pkg of packages) {
      if (!listed.has(pkg.name))
        report(file, `package ${pkg.name} is a plugin but is not listed in the root marketplace`);
    }
  }

  function checkBundle(pkg) {
    const bundle = join(pkg.dir, "dist", "bundle.js");
    if (!existsSync(bundle)) {
      report(bundle, "dist/bundle.js missing - the plugin has no built server and cannot start");
      return;
    }
    if (isTracked && !isTracked(bundle)) {
      report(bundle, "dist/bundle.js not tracked by git - /plugin installs from the repo, so this file would not ship");
    }
  }

  function checkOpenCodeAdapter(pkg) {
    const packageFile = join(pkg.dir, "package.json");
    const codexDirectory = join(pkg.dir, ".codex-plugin");
    if (!(existsSync(codexDirectory) || existsSync(packageFile))) return;

    const claudeFile = join(pkg.dir, ".claude-plugin", "plugin.json");
    const codexFile = join(codexDirectory, "plugin.json");
    const claude = readJson(claudeFile, false);
    const codex = existsSync(codexFile) ? readJson(codexFile) : null;
    if (!existsSync(codexFile)) report(codexFile, "missing — the Codex manifest is part of the shared plugin metadata");

    if (claude)
      checkSkillMentions(claudeFile, claude.description ?? "", pkg, "Claude plugin description");
    if (codex) {
      if (codex.name !== pkg.name) report(codexFile, `name "${codex.name}" does not match directory "${pkg.name}"`);
      if (typeof codex.description !== "string" || !codex.description.trim()) report(codexFile, "description missing or empty");
      else checkSkillMentions(codexFile, codex.description, pkg, "Codex plugin description");
      if (claude?.version !== undefined && codex.version !== claude.version) {
        report(codexFile, `version "${codex.version}" disagrees with Claude manifest "${claude.version}"`);
      }
    }

    if (!existsSync(packageFile)) {
      report(packageFile, "missing — the OpenCode adapter package metadata is required");
      return;
    }
    const adapter = readJson(packageFile);
    if (!adapter) return;
    checkEncoding(packageFile, adapter);
    if (typeof adapter.description !== "string" || !adapter.description.trim()) report(packageFile, "description missing or empty");
    else checkSkillMentions(packageFile, adapter.description, pkg, "OpenCode package description");

    const expectedName = claude?.author?.name ? `@${claude.author.name}/${pkg.name}-opencode` : null;
    if (expectedName && adapter.name !== expectedName)
      report(packageFile, `name "${adapter.name}" does not match expected OpenCode package "${expectedName}"`);
    const expectedVersion = claude?.version ?? codex?.version;
    if (expectedVersion !== undefined && adapter.version !== expectedVersion)
      report(packageFile, `version "${adapter.version}" disagrees with plugin metadata "${expectedVersion}"`);
    if (!/^\d+\.\d+\.\d+$/.test(adapter.version ?? ""))
      report(packageFile, `version must be x.y.z, got ${JSON.stringify(adapter.version)}`);
    if (adapter.type !== "module") report(packageFile, `type must be "module", got ${JSON.stringify(adapter.type)}`);
    if (adapter.exports?.["."] !== "./index.js")
      report(packageFile, `exports["."] must be "./index.js", got ${JSON.stringify(adapter.exports?.["."])}`);
    if (adapter.dependencies?.["@opencode/plugin"] !== "2.0.18")
      report(packageFile, `dependencies["@opencode/plugin"] must be "2.0.18", got ${JSON.stringify(adapter.dependencies?.["@opencode/plugin"])}`);

    const files = adapter.files;
    if (!Array.isArray(files)) report(packageFile, "files must list the OpenCode entrypoint and shared inventory directories");
    else {
      for (const required of ["index.js", "skills", "agents"])
        if (!files.includes(required)) report(packageFile, `files must include "${required}" for the shared OpenCode inventory`);
    }

    const entrypoint = join(pkg.dir, "index.js");
    if (!existsSync(entrypoint)) report(entrypoint, "missing — package exports point at the OpenCode adapter entrypoint");
    else if (isTracked && !isTracked(entrypoint)) report(entrypoint, "not tracked by git — the OpenCode adapter entrypoint would not ship");
    if (isTracked && !isTracked(packageFile)) report(packageFile, "not tracked by git — the OpenCode package metadata would not ship");
    if (existsSync(codexFile) && isTracked && !isTracked(codexFile))
      report(codexFile, "not tracked by git — the Codex manifest would not ship");
  }

  /** Run every per-package check for one plugin. */
  function checkPackage(pkg, packages) {
    const manifest = readJson(join(pkg.dir, "package.json"));
    if (!manifest) return;
    checkEncoding(join(pkg.dir, "package.json"), manifest);
    checkManifest(pkg, manifest);
    checkBundle(pkg);
    checkMcpConfig(pkg);
    checkPluginJson(pkg, manifest);
    checkSkills(pkg);
    checkAgents(pkg);
    checkAgentReferences(pkg, packages);
    const local = join(pkg.dir, ".claude-plugin", "marketplace.json");
    if (existsSync(local)) {
      report(local, "package-level marketplace is forbidden - use the repository root .claude-plugin/marketplace.json");
    }
  }

  return { checkPackage, checkMarketplace, checkOpenCodeAdapter };
}

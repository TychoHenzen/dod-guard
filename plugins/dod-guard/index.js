import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function readMarkdown(file) {
  const source = readFileSync(file, "utf8");
  const match = FRONTMATTER.exec(source);
  if (!match) throw new Error(`Missing frontmatter: ${file}`);

  const fields = {};
  let block;
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line);
    if (field) {
      block = field[2].startsWith(">") ? field[1] : undefined;
      fields[field[1]] = block ? [] : field[2];
      if (block) continue;
    }
    if (block && /^\s+/.test(line)) fields[block].push(line.trim());
  }

  return { fields, content: source.slice(match[0].length).trimStart() };
}

function loadSkills() {
  const root = join(ROOT, "skills");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const path = join(root, entry.name, "SKILL.md");
      const { fields, content } = readMarkdown(path);
      return {
        id: entry.name,
        name: fields.name ?? entry.name,
        description: Array.isArray(fields.description) ? fields.description.join(" ") : fields.description,
        path,
        content,
      };
    });
}

function loadAgents() {
  const root = join(ROOT, "agents");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const path = join(root, entry.name);
      const { fields, content } = readMarkdown(path);
      return {
        id: entry.name.slice(0, -3),
        name: fields.name ?? entry.name.slice(0, -3),
        description: Array.isArray(fields.description) ? fields.description.join(" ") : fields.description,
        system: content,
      };
    });
}

const plugin = {
  id: "dod-guard",
  async setup(ctx) {
    const skills = loadSkills();
    const agents = loadAgents();

    await ctx.skill.transform((editor) => {
      for (const skill of skills) editor.add(skill);
    });
    await ctx.agent.transform((editor) => {
      for (const agent of agents) {
        editor.update(agent.id, (current) => {
          current.name = agent.name;
          current.description = agent.description;
          current.mode = "subagent";
          current.hidden = false;
          current.system = agent.system;
        });
      }
    });
  },
};

export default plugin;

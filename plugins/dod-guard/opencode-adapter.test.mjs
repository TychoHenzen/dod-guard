import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import plugin from "./index.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

test("registers the shipped skills and agents without copying their bodies", async () => {
  const skills = [];
  const agents = [];

  await plugin.setup({
    skill: {
      transform: async (callback) => callback({ add: (skill) => skills.push(skill) }),
    },
    agent: {
      transform: async (callback) =>
        callback({
          update: (id, update) => {
            const agent = { id, permissions: [] };
            update(agent);
            agents.push(agent);
          },
        }),
    },
  });

  const skillDirectories = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const agentFiles = readdirSync(join(ROOT, "agents")).filter((file) => file.endsWith(".md"));
  assert.equal(skills.length, skillDirectories.length);
  assert.equal(agents.length, agentFiles.length);
  assert.ok(skills.every((skill) => readFileSync(skill.path, "utf8").includes(skill.content)));
  assert.ok(skills.every((skill) => !skill.content.startsWith("---")));
  assert.ok(agents.every((agent) => agent.system && agent.system.length > 0));
});

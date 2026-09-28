import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import plugin from "./index.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const INCOMPLETE_CONTEXT_ERROR = /requires skill\.transform and agent\.transform/;

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

test("rejects an incomplete OpenCode host context", async () => {
  await assert.rejects(() => plugin.setup({}), INCOMPLETE_CONTEXT_ERROR);
});

test("does not register the same OpenCode context twice", async () => {
  let skillAdds = 0;
  let agentUpdates = 0;
  const context = {
    skill: {
      transform: async (callback) => callback({ add: () => (skillAdds += 1) }),
    },
    agent: {
      transform: async (callback) =>
        callback({
          update: (id, update) => {
            agentUpdates += 1;
            update({ id, permissions: [] });
          },
        }),
    },
  };

  await plugin.setup(context);
  await plugin.setup(context);

  const skillDirectories = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const agentFiles = readdirSync(join(ROOT, "agents")).filter((file) => file.endsWith(".md"));
  assert.equal(skillAdds, skillDirectories.length);
  assert.equal(agentUpdates, agentFiles.length);
});

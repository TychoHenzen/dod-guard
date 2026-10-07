import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import test from "node:test";
import {
  ROOT,
  assertSupportedOpenCode,
  createFixture,
  request,
  startServer,
  stop,
  waitFor,
} from "./opencode-fixture.mjs";

async function assertPluginLoaded(baseUrl, headers, fixture) {
  const configResult = await request(baseUrl, headers, "/api/config");
  assert.equal(configResult.response.status, 200, JSON.stringify(configResult.body));
  assert.ok(
    configResult.body.some((source) => source.path === fixture.config && source.info.plugins?.includes(ROOT)),
    `OpenCode did not resolve ${fixture.config}: ${JSON.stringify(configResult.body)}`,
  );

  const pluginResult = await waitFor("dod-guard plugin", async () => {
    const result = await request(baseUrl, headers, "/api/plugin");
    return result.body.data?.find((plugin) => plugin.id === "dod-guard") ?? false;
  });
  assert.equal(pluginResult.state.status, "active");
  assert.equal(pluginResult.source.type, "local");

  const checkResult = await request(baseUrl, headers, "/api/plugin/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(checkResult.response.status, 200, JSON.stringify(checkResult.body));
  assert.equal(checkResult.body.data.find((plugin) => plugin.id === "dod-guard")?.state.status, "active");
}

async function assertSkillAndAgentListed(baseUrl, headers) {
  const skillsResult = await request(baseUrl, headers, "/api/skill");
  assert.equal(skillsResult.response.status, 200, JSON.stringify(skillsResult.body));
  assert.match(
    skillsResult.body.data.find((skill) => skill.id === "next-ticket")?.path ?? "",
    /next-ticket[\\/]SKILL\.md$/,
  );

  const agentResult = await request(baseUrl, headers, "/api/agent/doc-conflict-judge");
  assert.equal(agentResult.response.status, 200, JSON.stringify(agentResult.body));
  assert.equal(agentResult.body.data.id, "doc-conflict-judge");
  assert.equal(agentResult.body.data.mode, "subagent");
}

async function assertSkillInvocation(baseUrl, headers) {
  const sessionResult = await request(baseUrl, headers, "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "dod-guard discovery fixture" }),
  });
  assert.equal(sessionResult.response.status, 200, JSON.stringify(sessionResult.body));
  const sessionId = sessionResult.body.data.id;
  const invokeResult = await request(baseUrl, headers, `/api/experimental/session/${sessionId}/skill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "next-ticket", resume: false }),
  });
  assert.equal(invokeResult.response.status, 204, JSON.stringify(invokeResult.body));

  const messagesResult = await request(baseUrl, headers, `/api/session/${sessionId}/message`);
  assert.equal(messagesResult.response.status, 200, JSON.stringify(messagesResult.body));
  assert.ok(messagesResult.body.data.some((message) => message.type === "skill" && message.skill === "next-ticket"));

  const promptText = "Use the next-ticket skill with the doc-conflict-judge agent.";
  const promptResult = await request(baseUrl, headers, `/api/session/${sessionId}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: promptText,
      skills: [{ id: "next-ticket" }],
      agents: [{ name: "doc-conflict-judge" }],
      resume: false,
    }),
  });
  assert.equal(promptResult.response.status, 200, JSON.stringify(promptResult.body));
  assert.equal(promptResult.body.data.type, "user", JSON.stringify(promptResult.body));
  assert.equal(promptResult.body.data.payload.text, promptText);
  assert.deepEqual(
    promptResult.body.data.payload.skills.map((skill) => skill.id),
    ["next-ticket"],
  );
  assert.deepEqual(
    promptResult.body.data.payload.agents.map((agent) => agent.name),
    ["doc-conflict-judge"],
  );
}

test("loads dod-guard through a disposable OpenCode v2.0.18 project", async () => {
  assertSupportedOpenCode();
  const fixture = createFixture([ROOT]);
  let server;

  try {
    const connection = await startServer(fixture);
    ({ server } = connection);
    const { baseUrl, headers } = connection;
    await assertPluginLoaded(baseUrl, headers, fixture);
    await assertSkillAndAgentListed(baseUrl, headers);
    await assertSkillInvocation(baseUrl, headers);
  } finally {
    if (server) await stop(server);
    rmSync(fixture.fixture, { recursive: true, force: true });
    assert.equal(existsSync(fixture.fixture), false);
  }
});

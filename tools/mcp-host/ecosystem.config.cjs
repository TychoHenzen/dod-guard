"use strict";
const path = require("node:path");

const launcher = path.join(__dirname, "launcher.mjs");

module.exports = {
  apps: [
    {
      name: "dod-guard-quality-guard",
      script: launcher,
      interpreter: "node",
      args: "--service quality-guard",
      env: {
        MCP_HOST_BIND_HOST: process.env.MCP_HOST_BIND_HOST || "127.0.0.1",
        MCP_HOST_QUALITY_GUARD_PORT: process.env.MCP_HOST_QUALITY_GUARD_PORT || "21720",
        MCP_HOST_QUALITY_GUARD_PATH: process.env.MCP_HOST_QUALITY_GUARD_PATH || "/servers/quality-guard/mcp",
        MCP_HOST_QUALITY_GUARD_HEALTH_PATH: process.env.MCP_HOST_QUALITY_GUARD_HEALTH_PATH || "/servers/quality-guard/health",
      },
    },
    {
      name: "dod-guard-knowledge-base",
      script: launcher,
      interpreter: "node",
      args: "--service knowledge-base",
      env: {
        MCP_HOST_BIND_HOST: process.env.MCP_HOST_BIND_HOST || "127.0.0.1",
        MCP_HOST_KNOWLEDGE_BASE_PORT: process.env.MCP_HOST_KNOWLEDGE_BASE_PORT || "21721",
        MCP_HOST_KNOWLEDGE_BASE_PATH: process.env.MCP_HOST_KNOWLEDGE_BASE_PATH || "/servers/knowledge-base/mcp",
        MCP_HOST_KNOWLEDGE_BASE_HEALTH_PATH: process.env.MCP_HOST_KNOWLEDGE_BASE_HEALTH_PATH || "/servers/knowledge-base/health",
        DOD_GUARD_KNOWLEDGE_BASE_DIR: process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR,
      },
    },
  ],
};

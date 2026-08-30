# Dependency spike records

This directory contains only repeatable dependency-spike inputs and observations.
Production code must not import these files or the evaluated dependencies.

Run `scripts/mcp-handshake.mjs` with an isolated executable. It sends MCP `initialize`,
`notifications/initialized`, and `tools/list`, then writes the raw responses to the path
in `CODE_EXPLORER_SPIKE_OUTPUT`.

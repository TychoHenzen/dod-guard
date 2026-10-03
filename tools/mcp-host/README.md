# Shared MCP host

`ecosystem.config.cjs` defines one PM2 app for `quality-guard` and one for
`knowledge-base`. Both bind loopback by default and resolve the newest
semantic-versioned bundle below the configured Codex or Claude cache roots.

```text
pm2 start tools/mcp-host/ecosystem.config.cjs
```

The default endpoints are:

- `quality-guard`: `http://127.0.0.1:21720/servers/quality-guard/mcp`
- `knowledge-base`: `http://127.0.0.1:21721/servers/knowledge-base/mcp`

Set `MCP_HOST_BUNDLE_ROOTS` or the service-specific `MCP_HOST_*_BUNDLE`
variable when the installed cache is elsewhere. Same-version candidates are
rejected as ambiguous instead of being selected by directory order. Set
`DOD_GUARD_KNOWLEDGE_BASE_DIR` before starting the knowledge-base app.

The tracked package registrations use these defaults. If endpoint environment
variables override a port or path, render matching client registrations before
connecting a client:

```text
node tools/mcp-host/launcher.mjs --print-config
```

The command prints a complete `mcpServers` JSON object using the same PM2
environment values and rejects non-loopback registration hosts.

The launcher owns bundle selection and process signals. Package factories own
MCP tool registration and HTTP request handling; the host does not construct
package internals or change repository roots.

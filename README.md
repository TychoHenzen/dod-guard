# dod-guard

Anti-cheat Definition of Done verification for Claude Code. Locks proof commands in MCP storage so editing the rendered markdown cannot weaken verification.

## What it does

- **Locks proofs canonically** — proof commands stored in MCP, not in editable markdown
- **Tamper-evident** — SHA256 fingerprint of proof set printed on every check
- **Amendment audit trail** — all proof modifications logged with mandatory reasons
- **Weakening prevention** — cannot convert machine-checkable proofs to manual
- **Structured interviews** — `/interview` skill gathers requirements before implementation

## Install

### As a Claude Code plugin (recommended)

```
claude plugin install --from github tychohenzen/dod-guard
```

### As a standalone MCP server

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "dod-guard": {
      "command": "npx",
      "args": ["-y", "dod-guard"],
      "type": "stdio"
    }
  }
}
```

### Via npm global install

```bash
npm install -g dod-guard
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `dod_create` | Create a locked DoD with proof commands and metadata |
| `dod_check` | Execute all proofs from canonical storage, return PASS/FAIL |
| `dod_status` | Read cached last check result without re-running |
| `dod_amend` | Modify a proof with mandatory reason (audit-logged) |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse existing DoD markdown and lock its proofs |

## Skills

### `/interview`

Structured requirements gathering skill. Researches the codebase, asks targeted questions one at a time, builds a confirmed requirements summary, then creates a locked DoD via `dod_create`.

The output is a self-contained spec with testable proofs that can be passed to `/goal` for autonomous implementation.

## How it works

### Proof lifecycle

```
/interview → dod_create → [implement] → dod_check → PASS/FAIL
                                              ↓
                                    dod_amend (if unreasonable)
```

1. **Create** — `/interview` or direct `dod_create` call locks proofs in `~/.claude/dod-store/`
2. **Implement** — work through steps, proofs are the acceptance criteria
3. **Check** — `dod_check` executes commands from the locked store (not the markdown)
4. **Amend** — if a proof is genuinely unreasonable, `dod_amend` modifies it with a logged reason

### Anti-cheat properties

- Proof commands live in `~/.claude/dod-store/{uuid}.json`, not in the markdown file
- `dod_check` reads from the store — editing markdown proof text has zero effect
- Each check prints a SHA256 fingerprint — compare to detect store tampering
- Cannot weaken a machine-checkable proof to `manual` (blocked server-side)
- All amendments are permanently logged with timestamps and reasons

### Predicate types

| Type | Value | Passes when |
|------|-------|-------------|
| `exit_code` | `0` | Command exits 0 |
| `exit_code` | `1` | Command exits 1 (e.g. grep no matches) |
| `exit_code_not` | `0` | Command exits non-zero |
| `output_contains` | `"text"` | stdout contains text |
| `output_matches` | `"regex"` | stdout matches regex |
| `manual` | — | Skipped by checker (human-only) |

## Development

```bash
npm install
npm run build    # TypeScript compilation
npm run bundle   # esbuild → dist/bundle.js
npm start        # Run MCP server
```

## License

MIT

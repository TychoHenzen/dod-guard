# Worker Dispatch Specification

## Purpose

Defines how evomcp reaches a cheap worker at all. It spawns `claude -p`
subprocesses pointed at the deepclaude proxy, and resolves the API key that
authenticates those subprocesses. It also checks whether the proxy is alive,
and measures token spend and failure signatures for each attempt. Every
other evomcp capability spawns work through this layer.

## Requirements

### Requirement: Prompts reach the worker over standard input

The dispatcher SHALL supply the task prompt to the `claude -p` subprocess on
its standard input, never as a command-line argument. The subprocess SHALL run
with `-p` and no other positional argument.

#### Scenario: Normal prompt
- **WHEN** the dispatcher spawns a worker for a prompt
- **THEN** the prompt text is written to the subprocess's stdin and the stdin
  stream is closed afterward

#### Scenario: Oversized prompt
- **WHEN** the prompt exceeds 32,000 characters
- **THEN** the prompt still travels over stdin and never appears in the
  subprocess's argument list

### Requirement: A system prompt travels through a temporary file

When the caller supplies a system prompt, the dispatcher SHALL write it to a
temporary file and pass that file's path to the subprocess. The dispatcher
SHALL remove the temporary file once the subprocess settles, whether it
succeeded, failed, or timed out.

#### Scenario: System prompt supplied
- **WHEN** the caller passes a system prompt alongside the task prompt
- **THEN** the subprocess receives a `--system-prompt-file` pointing at a file
  holding that text, and the file is gone once the attempt settles

### Requirement: A stalled worker is killed and reported as timed out

The dispatcher SHALL enforce a timeout on every spawned worker, defaulting to
five minutes when the caller sets none. A worker that exceeds the timeout
SHALL be terminated and the attempt SHALL report `timedOut: true` with a
negative exit code, rather than hang the caller.

#### Scenario: Worker exceeds its timeout
- **WHEN** a spawned worker produces no completion before the timeout elapses
- **THEN** the dispatcher signals it to stop, and the returned result marks
  the attempt as timed out

#### Scenario: Worker completes before its timeout
- **WHEN** a spawned worker exits on its own before the timeout elapses
- **THEN** the returned result marks the attempt as not timed out and carries
  the worker's real exit code

### Requirement: A failed or errored spawn still returns a result

The dispatcher SHALL resolve rather than reject when the underlying process
cannot start or exits abnormally. A spawn failure SHALL be reported as a
non-zero exit code with a descriptive message in the output, not thrown to the
caller.

#### Scenario: The claude binary cannot be found
- **WHEN** spawning the subprocess fails outright
- **THEN** the dispatcher returns a result carrying a negative exit code and
  an explanatory message, and does not throw

### Requirement: Dispatch requires a resolved API key

The dispatcher SHALL refuse to spawn a worker when no API key can be
resolved. It SHALL raise an error naming the environment variable and
configuration file the caller can use to supply one.

#### Scenario: No key anywhere
- **WHEN** the caller supplies no key, the environment variable is unset, and
  backends.json holds no usable key
- **THEN** the dispatcher raises an error before spawning any subprocess

### Requirement: The API key resolves in a fixed priority order

The key resolver SHALL prefer, in order: an explicit key passed by the
caller, the `DEEPSEEK_API_KEY` environment variable, then the default
backend's key inside `~/.claude/backends.json`. It SHALL return an empty
string when none of the three yields a key.

#### Scenario: Explicit key wins over the environment
- **WHEN** the caller passes an explicit key and the environment variable is
  also set to a different value
- **THEN** the resolver returns the caller's explicit key

#### Scenario: Environment wins over the config file
- **WHEN** no explicit key is passed, the environment variable is set, and
  backends.json also holds a key
- **THEN** the resolver returns the environment variable's value

#### Scenario: Config file is the last resort
- **WHEN** no explicit key is passed and the environment variable is unset
- **THEN** the resolver reads the default backend's key from
  `~/.claude/backends.json`

#### Scenario: Config file missing or unreadable
- **WHEN** `~/.claude/backends.json` does not exist, fails to parse, or names
  a default backend absent from its own `backends` map
- **THEN** the resolver treats the file as holding no key, without raising

#### Scenario: Late-created config file
- **WHEN** the config file is absent on an earlier resolution and later
  appears with a usable key
- **THEN** a subsequent resolution picks up the newly available key without
  requiring a restart

### Requirement: The caller can see where the key came from

The dispatcher SHALL expose which of the four sources supplied the resolved
key: the caller's option, the environment variable, the config file, or none.
This SHALL be available for diagnostics separately from the key value itself.

#### Scenario: Status reporting
- **WHEN** something reports on dispatch readiness
- **THEN** it can distinguish a key sourced from the option, the environment,
  or the config file, or report the absence of any key. It does this
  without exposing the key value itself

### Requirement: Proxy health is checked, not assumed

The dispatcher SHALL be able to check whether the deepclaude proxy answers a
health request within a short timeout. A proxy that does not answer, answers
with a non-success status, or answers without the expected readiness field
SHALL be reported as not healthy.

#### Scenario: Proxy healthy
- **WHEN** the proxy responds successfully with its mode set
- **THEN** the health check reports the proxy as alive

#### Scenario: Proxy unreachable
- **WHEN** the health request fails outright, for example the connection is
  refused
- **THEN** the health check reports the proxy as not alive rather than
  raising

#### Scenario: Proxy responds without a mode
- **WHEN** the proxy responds successfully but the response carries no mode
  field
- **THEN** the health check reports the proxy as not alive

### Requirement: A dead proxy blocks worker dispatch until it recovers or is started

Before spawning a worker in proxy mode, the dispatcher SHALL either find the
proxy already healthy or attempt to start it. Starting the proxy SHALL
require both the deepclaude installation and a resolvable API key. If
either is missing, the dispatcher SHALL abort the attempt to start it
without dispatching a worker.

#### Scenario: Proxy already running
- **WHEN** the health check reports the proxy alive
- **THEN** the dispatcher proceeds without attempting to start it

#### Scenario: Proxy down and no local installation
- **WHEN** the health check reports the proxy dead and the deepclaude
  installation is not present locally
- **THEN** the dispatcher reports failure and does not spawn a worker

#### Scenario: Proxy down and no API key available
- **WHEN** the health check reports the proxy dead and no API key can be
  resolved
- **THEN** the dispatcher reports failure and does not spawn a worker

#### Scenario: Proxy starts successfully
- **WHEN** the proxy is started and becomes healthy within the startup wait
  window
- **THEN** the dispatcher proceeds with dispatch

#### Scenario: Proxy fails to become healthy
- **WHEN** the proxy is started but does not answer healthy within the
  startup wait window
- **THEN** the dispatcher reports failure and does not spawn a worker

### Requirement: Token spend is measured exactly once per attempt

For every dispatched attempt, the token measurement SHALL run exactly once,
regardless of whether the attempt succeeded, timed out, or produced no
output. An attempt SHALL never be measured twice, and SHALL never be left
unmeasured.

#### Scenario: Attempt times out
- **WHEN** a dispatched worker times out before producing a result
- **THEN** the token measurement for that attempt still runs exactly once

#### Scenario: Attempt produces no output
- **WHEN** a dispatched worker exits with empty output
- **THEN** the token measurement for that attempt still runs exactly once

### Requirement: Failure output is hashed into a stable signature

The dispatcher SHALL reduce a failure's output to a SHA-256 hex digest over a
normalized form of that output. Normalization SHALL strip timestamps,
file:line locations, hexadecimal addresses, durations, and temporary
directory paths before hashing. Two failures differing only in those
volatile details then hash identically.

#### Scenario: Same failure, different timestamps
- **WHEN** two failure outputs are identical except for their embedded
  timestamps
- **THEN** they hash to the same signature

#### Scenario: Same failure, different file:line or temp path
- **WHEN** two failure outputs are identical except for the file and line
  number or the temporary path they reference
- **THEN** they hash to the same signature

#### Scenario: Genuinely different failures
- **WHEN** two failure outputs describe different errors
- **THEN** they hash to different signatures

# Command composition contract

This is the repository's authoritative contract for commands that cross an
active shell and a native executable. It applies to delivery, validation, and
handoff commands. The focused proof is
`node scripts/ci/command-composition.test.mjs`.

## Shell boundaries

- **Windows PowerShell:** Keep PowerShell operators such as `-not`, `-and`,
  `Test-Path`, and `Select-Object` in PowerShell. Invoke native programs with
  explicit arguments, capture their exit status, and do not rely on POSIX
  operators such as `head`, `&&`, or `$(...)`.
- **Native executable:** Treat `rtk`, `node`, `npm`, `npx`, `git`, and client
  launchers as executables, not as shell scripts. Use an explicit argument for
  each path or positional value. A successful process exit and the expected
  output are both required proof.
- **POSIX shell:** Use Git Bash or WSL only when it was explicitly selected.
  A bare `bash` name does not prove that Git Bash was selected on Windows.
  Keep POSIX operators inside that selected shell and never paste them into a
  PowerShell command.

## Safe patterns

### Paths and arguments

Expand paths before invoking a native tool. Pass each path as its own separate
argument; path lists must arrive as separate arguments. Do not pass a literal
wildcard or a PowerShell array through an npm shim and claim success from
`Checked 0 files`.

```powershell
& npx @biomejs/biome check `
  "packages/code-explorer/src/" `
  "packages/fossil/src/" `
  "packages/quality-guard/src/" `
  "scripts/ci/" `
  --no-errors-on-unmatched
if ($LASTEXITCODE -ne 0) { throw "Biome check failed with exit code $LASTEXITCODE" }
```

### Bounded output

Do not close an `rtk` or other native producer with a downstream `head` pipe.
Capture the complete output, preserve the producer's exit status, and limit
what is displayed only after the process has completed:

```powershell
$lines = @(& rtk rg --hidden "pattern" "packages/quality-guard/src/")
$status = $LASTEXITCODE
$lines | Select-Object -First 45
if ($status -ne 0) { throw "rtk rg failed with exit code $status" }
```

In an explicitly selected Git Bash or WSL shell, write output to a temporary
file, save `$?`, then display a bounded slice and return the saved status.

### Preconditions

Validate required positional arguments and destination parents before starting
the command that can mutate state:

```powershell
$package = "knowledge-base"
if ([string]::IsNullOrWhiteSpace($package)) {
  throw "preflight: missing required package argument"
}
$destination = "packages/knowledge-base/knowledge/entries"
$parent = Split-Path -Parent $destination
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}
```

The preflight failure must report its stage or prerequisite and leave the
repository unchanged. For example, run
`node scripts/ci/smoke-bundle.mjs knowledge-base`, not the same command without
its required package name.

### Patch and cleanup boundaries

Prefer the direct patch tool. If a Windows wrapper receives a here-string,
remove its trailing newline before passing the payload and require the exact
`*** End Patch` boundary. A rejected patch is not a partial success.

Do not use a policy-blocked recursive PowerShell cleanup command as a probe.
Treat the refusal as a pre-execution stop, validate a generated path is inside
the intended temporary root, and use a small direct Node probe when cleanup is
actually needed. Never claim cleanup succeeded when the command never ran.

## Incident map

| Incident | Correct boundary and proof |
| --- | --- |
| Multiline patch wrapper | Trim the wrapper payload and require the final patch marker; a rejected wrapper leaves files unchanged. |
| Literal glob or collapsed path list | Expand paths and pass separate native arguments; assert selected paths and non-zero failure for an unexpanded list. |
| Downstream RTK truncation | Capture output before limiting display; assert the producer's exit status independently. |
| Missing positional argument | Validate before execution and print the usage plus the missing argument name. |
| Missing destination parent | Check or create the parent before `git mv`; failed preflight must not move or delete anything. |
| Policy-blocked cleanup | Stop before execution, preserve mutation state, and report the policy stage; use a validated direct probe instead. |

Historical incident records remain evidence, not supported command paths. New
guidance links here instead of copying another shell dialect or reintroducing
one of the fragile forms.

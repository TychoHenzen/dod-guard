Proof commands run on the host OS. dod_create/dod_refine/dod_amend validate that
commands reference tools available on the current platform.

Shell invocation is built by buildShellInvocation() in evaluate-proof.ts - the
single place that knows how to reach a shell. On Windows it produces
"cmd.exe /d /s /c <command>" with windowsVerbatimArguments true. Both details are
load-bearing: cmd.exe has no single-quote grouping (wrapping in quotes makes it
look for a program named 'command), and Node's default Windows quoting escapes
embedded double quotes in a way cmd.exe doesn't understand, silently mangling a
findstr call and a node -e call into no-ops that exit 0. Never hand-roll shell
escaping elsewhere.

There is no manual predicate. Human-verified steps are draft leaves with a
MANUAL intent - drafts hold the verdict at INCOMPLETE, which is the correct "a
human still owes us something" semantic.

This is a private project. Remove old code paths outright - no deprecation
warnings, compat layers, or feature flags.

ignoreUnknown in biome.json is a boolean (true), not "ignoreUnknowns". Biome
v2.5.3 changed this from earlier versions.

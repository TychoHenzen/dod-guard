import { ALL_RULES } from "./lib/config.mjs";

export const USAGE = `quality-scan [paths...] [options]

  --format=text|json|units   text (default), raw violations, or per-file
                             work units
  --rules=a,b,c              only run these rules (default: all)
  --exclude=<fragment>       skip paths whose "/" + relative path contains this fragment (repeatable)
  --test-path=<fragment>     treat paths containing this fragment as test code
                             (repeatable)
  --registered-attribute=<Name>
                             a C# attribute whose classes something builds by
                             reflection, so they are never dead exports
                             (repeatable; GlobalClass is built in)
  --root=<dir>               anchor for relative paths (default: cwd)
  --no-config                ignore <root>/.quality-guard.json (the gate passes
                             its own --exclude and --registered-attribute lists)
  --top=N                    text mode: show N worst files (default 15)

Rules: ${ALL_RULES.join(", ")}`;

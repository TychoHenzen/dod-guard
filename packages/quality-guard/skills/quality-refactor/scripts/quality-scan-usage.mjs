import { ALL_RULES } from "./lib/config.mjs";

export const USAGE = `quality-scan [paths...] [options]

  --format=text|json|units   text (default), raw violations, or per-file
                             work units
  --profile=default|strict   strict promotes every "preferably" bound to a
                             hard bound
  --rules=a,b,c              only run these rules (default: all)
  --exclude=<fragment>       skip paths containing this fragment (repeatable)
  --test-path=<fragment>     treat paths containing this fragment as test code
                             (repeatable)
  --root=<dir>               anchor for relative paths (default: cwd)
  --top=N                    text mode: show N worst files (default 15)
  --write-baseline=<path>    record the current scan as the ratchet baseline
  --baseline=<path>          compare against a baseline; unseen files are
                             adopted
  --fail-on=none|error|regression|any   what makes this exit 1 (default: none)

Rules: ${ALL_RULES.join(", ")}`;

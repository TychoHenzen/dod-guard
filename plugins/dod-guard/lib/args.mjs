// Command-line parsing shared by the script CLIs across every skill in this
// plugin. The skills ship as one unit, so one copy of this belongs here rather
// than one copy per skill directory.
//
// Every one of those CLIs takes flags only. A bare word is a mistake worth
// reporting rather than guessing at, so parsing returns null instead of
// skipping it.

export function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
    if (!match) {
      return null;
    }
    args[match[1]] = match[2] ?? "true";
  }
  return args;
}

export function numberArg(args, name, fallback) {
  const raw = args?.[name];
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

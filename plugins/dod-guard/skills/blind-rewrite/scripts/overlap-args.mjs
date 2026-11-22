const USAGE = [
  "usage: overlap-scan.mjs --original=<path> --rewrite=<path> [--mode=code|prose]",
  "[--whitelist=a,b] [--contract-file=<path>] [--require-contract]",
].join(" ");

function parseFlag(arg) {
  const pair = /^--([^=]+)=(.*)$/.exec(arg);
  if (pair) return [pair[1], pair[2]];
  const bare = /^--([^=]+)$/.exec(arg);
  return bare ? [bare[1], "true"] : null;
}

export function parseArgs(argv) {
  const options = { mode: "code", whitelist: [] };
  for (const arg of argv) {
    const flag = parseFlag(arg);
    if (flag) options[flag[0]] = flag[1];
  }
  options.whitelist = String(options.whitelist ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return options;
}

// Returns the usage-error message for unusable options, or null when they are fine.
export function optionError(options) {
  if (!options.original || !options.rewrite) return USAGE;
  if (options["require-contract"] === "true" && !options["contract-file"]) {
    return "overlap-scan: --require-contract needs --contract-file=<path>";
  }
  return null;
}

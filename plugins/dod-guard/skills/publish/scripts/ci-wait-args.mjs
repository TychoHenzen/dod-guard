// Command-line parsing for ci-wait.mjs. Flag parsing and validation are
// separate steps so each rule is one table row instead of a branch.
const SYNOPSIS = "--repository=<owner/name> --sha=<sha> [--require=a,b] [--attempts=5] [--interval=15]";
export const USAGE = `usage: node ci-wait.mjs ${SYNOPSIS}`;

const FLAG_SETTERS = {
  "--repository": (options, value) => {
    options.repository = value;
  },
  "--sha": (options, value) => {
    options.sha = value;
  },
  "--attempts": (options, value) => {
    options.attempts = Number(value);
  },
  "--interval": (options, value) => {
    options.intervalSeconds = Number(value);
  },
  "--require": (options, value) => {
    options.required = value.split(",").filter(Boolean);
  },
};

const OPTION_RULES = [
  [(o) => /^[^/\s]+\/[^/\s]+$/.test(o.repository ?? ""), "--repository=<owner/name> is required"],
  [(o) => /^[0-9a-f]{40}$/.test(o.sha ?? ""), "--sha=<40 hex characters> is required"],
  [(o) => Number.isInteger(o.attempts) && o.attempts >= 1, "--attempts must be a positive integer"],
  [(o) => o.intervalSeconds >= 0, "--interval must be a number of seconds"],
];

function parseFlags(argv) {
  const options = { attempts: 5, intervalSeconds: 15, required: [] };
  for (const argument of argv) {
    const [key, value = ""] = argument.split(/[=](.*)/s, 2);
    const setter = Object.hasOwn(FLAG_SETTERS, key) ? FLAG_SETTERS[key] : null;
    if (!setter) throw new Error(`unknown argument ${argument}`);
    setter(options, value);
  }
  return options;
}

export function parseArguments(argv) {
  const options = parseFlags(argv);
  const broken = OPTION_RULES.find(([isValid]) => !isValid(options));
  if (broken) throw new Error(broken[1]);
  return options;
}

// Command-line parsing for ci-wait.mjs. Flag parsing and validation are
// separate steps so each rule is one table row instead of a branch.
const SYNOPSIS = "--repository=<owner/name> --sha=<sha> [--require=<names>]... [--attempts=5] [--interval=15]";

const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;
const SHA = /^[0-9a-f]{40}$/;
const FIRST_EQUALS = /[=](.*)/s;
const NAME_DEPTH = new Map([
  ["(", 1],
  ["[", 1],
  [")", -1],
  ["]", -1],
]);

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
  // Repeated --require flags add up.
  "--require": (options, value) => {
    options.required.push(...checkNames(value));
  },
};

const isRepository = (options) => REPOSITORY.test(options.repository ?? "");
const isSha = (options) => SHA.test(options.sha ?? "");
const isAttemptCount = ({ attempts }) => Number.isInteger(attempts) && attempts >= 1;
const isInterval = (options) => options.intervalSeconds >= 0;

const OPTION_RULES = [
  [isRepository, "--repository=<owner/name> is required"],
  [isSha, "--sha=<40 hex characters> is required"],
  [isAttemptCount, "--attempts must be a positive integer"],
  [isInterval, "--interval must be a number of seconds"],
];

function parseFlags(argv) {
  const options = { attempts: 5, intervalSeconds: 15, required: [] };
  for (const argument of argv) {
    const [key, value = ""] = argument.split(FIRST_EQUALS, 2);
    if (!Object.hasOwn(FLAG_SETTERS, key)) {
      throw new Error(`unknown argument ${argument}`);
    }
    FLAG_SETTERS[key](options, value);
  }
  return options;
}

export const USAGE = `usage: node ci-wait.mjs ${SYNOPSIS}`;

// Splits one --require value into check names at the commas between them. A
// comma inside parentheses or brackets belongs to a name, as in a GitHub
// Actions matrix name like "test (ubuntu-latest, 18)" or a job named
// "Unit tests (.NET, no Godot)". A stray ")" never takes the depth below 0.
// ASSUMPTION: no required check name has a comma outside parentheses or
// brackets; such a name splits into two names that never start.
export function checkNames(value) {
  const names = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    depth = Math.max(0, depth + (NAME_DEPTH.get(value[i]) ?? 0));
    if (value[i] === "," && depth === 0) {
      names.push(value.slice(start, i));
      start = i + 1;
    }
  }
  names.push(value.slice(start));
  return names.map((name) => name.trim()).filter(Boolean);
}

export function parseArguments(argv) {
  const options = parseFlags(argv);
  const broken = OPTION_RULES.find(([isValid]) => !isValid(options));
  if (broken) {
    throw new Error(broken[1]);
  }
  return options;
}

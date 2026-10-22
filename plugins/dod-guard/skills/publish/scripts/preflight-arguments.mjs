const flagOptions = new Map([["--registered-root", "registeredRoot"]]);
const valueOptions = new Map([
  ["--version", "version"],
  ["--skill-path", "path"],
  ["--inventory-status", "inventoryStatus"],
]);

function invalidOption(option) {
  return { error: `Invalid or duplicate argument: ${option}` };
}

function isUsableValue(key, value, requested) {
  return Boolean(key && value) && !value.startsWith("--") && requested[key] === undefined;
}

function readFlag(option, requested) {
  const flag = flagOptions.get(option);
  if (requested[flag]) return invalidOption(option);
  requested[flag] = true;
  return { consumed: 1 };
}

function readValue(options, index, requested) {
  const option = options[index];
  const key = valueOptions.get(option);
  const value = options[index + 1];
  if (!isUsableValue(key, value, requested)) return invalidOption(option);
  requested[key] = value;
  return { consumed: 2 };
}

// Reads one option at `index` into `requested` and reports how many tokens it used, or the error.
function readOption(options, index, requested) {
  if (flagOptions.has(options[index])) return readFlag(options[index], requested);
  return readValue(options, index, requested);
}

function readAll(options, requested) {
  for (let index = 0; index < options.length; ) {
    const read = readOption(options, index, requested);
    if (read.error) return read.error;
    index += read.consumed;
  }
}

// Client errors win over inventory errors; option errors are checked before both.
function validateRequest(client, requested) {
  if (client !== "codex" && client !== "claude") return "Client must be codex or claude";
  if (requested.inventoryStatus !== undefined && !/^\d+$/.test(requested.inventoryStatus)) {
    return "Invalid --inventory-status: must be a non-negative integer";
  }
}

export function parseArguments(args) {
  const [client, ...options] = args;
  const requested = {};
  const error = readAll(options, requested) ?? validateRequest(client, requested);
  return error ? { client, requested, error } : { client, requested };
}

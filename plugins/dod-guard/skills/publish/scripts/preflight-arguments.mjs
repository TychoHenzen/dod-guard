const flagOptions = new Map([["--registered-root", "registeredRoot"]]);
const valueOptions = new Map([
  ["--version", "version"],
  ["--skill-path", "path"],
  ["--inventory-status", "inventoryStatus"],
]);

// Reads one option at `index` into `requested` and reports how many tokens it used, or the error.
function readOption(options, index, requested) {
  const option = options[index];
  const invalid = { error: `Invalid or duplicate argument: ${option}` };
  if (flagOptions.has(option)) {
    const flag = flagOptions.get(option);
    if (requested[flag]) return invalid;
    requested[flag] = true;
    return { consumed: 1 };
  }
  const key = valueOptions.get(option);
  const value = options[index + 1];
  if (!(key && value) || value.startsWith("--") || requested[key] !== undefined) return invalid;
  requested[key] = value;
  return { consumed: 2 };
}

export function parseArguments(args) {
  const [client, ...options] = args;
  const requested = {};
  for (let index = 0; index < options.length; ) {
    const read = readOption(options, index, requested);
    if (read.error) return { client, requested, error: read.error };
    index += read.consumed;
  }
  if (client !== "codex" && client !== "claude") {
    return { client, requested, error: "Client must be codex or claude" };
  }
  if (requested.inventoryStatus !== undefined && !/^\d+$/.test(requested.inventoryStatus)) {
    return { client, requested, error: "Invalid --inventory-status: must be a non-negative integer" };
  }
  return { client, requested };
}

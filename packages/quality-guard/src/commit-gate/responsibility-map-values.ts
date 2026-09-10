export function object(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${location} must be an object`);
  return value as Record<string, unknown>;
}

export function onlyKeys(
  value: Record<string, unknown>,
  allowed: string[],
  location: string,
): void {
  Object.keys(value).forEach((key) => {
    if (!allowed.includes(key))
      throw new Error(`${location}.${key} is not supported`);
  });
}

export function strings(value: unknown, location: string): string[] {
  if (!Array.isArray(value))
    throw new Error(`${location} must be an array of non-empty strings`);
  if (value.some((item) => typeof item !== "string" || !item.trim()))
    throw new Error(`${location} must be an array of non-empty strings`);
  const result = value.map((item) => (item as string).trim());
  if (new Set(result).size !== result.length)
    throw new Error(`${location} contains duplicates`);
  return result;
}

function string(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${location} must be a non-empty string`);
  return value.trim();
}

export function responsibility(item: unknown, index: number) {
  const location = `responsibility map.responsibilities[${index}]`;
  const value = object(item, location);
  onlyKeys(
    value,
    ["name", "currentOwners", "consumers", "dependencies"],
    location,
  );
  return {
    name: string(value.name, `${location}.name`),
    currentOwners: strings(value.currentOwners, `${location}.currentOwners`),
    consumers: strings(value.consumers, `${location}.consumers`),
    dependencies: strings(value.dependencies, `${location}.dependencies`),
  };
}

function ownership(item: unknown, index: number) {
  const location = `responsibility map.desired.ownership[${index}]`;
  const value = object(item, location);
  onlyKeys(value, ["responsibility", "owner"], location);
  return {
    responsibility: string(value.responsibility, `${location}.responsibility`),
    owner: string(value.owner, `${location}.owner`),
  };
}

function boundary(item: unknown, index: number) {
  const location = `responsibility map.desired.boundaries[${index}]`;
  const value = object(item, location);
  onlyKeys(value, ["from", "to", "allowed"], location);
  if (typeof value.allowed !== "boolean")
    throw new Error(`${location}.allowed must be boolean`);
  return {
    from: string(value.from, `${location}.from`),
    to: string(value.to, `${location}.to`),
    allowed: value.allowed,
  };
}

export function desired(value: unknown) {
  const root = object(value, "responsibility map.desired");
  onlyKeys(root, ["ownership", "boundaries"], "responsibility map.desired");
  if (!(Array.isArray(root.ownership) && Array.isArray(root.boundaries)))
    throw new Error(
      "responsibility map.desired requires ownership and boundaries arrays",
    );
  const parsed = {
    ownership: root.ownership.map(ownership),
    boundaries: root.boundaries.map(boundary),
  };
  if (parsed.ownership.length + parsed.boundaries.length === 0)
    throw new Error(
      "responsibility map.desired must contain an ownership or boundary " +
        "outcome",
    );
  return parsed;
}

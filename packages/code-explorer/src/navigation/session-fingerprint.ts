export function canonicalFingerprint(
  toolName: string,
  arguments_: Record<string, unknown>,
): string {
  const { request_id: _requestId, ...remaining } = arguments_;
  return JSON.stringify({ tool: toolName, arguments: canonicalize(remaining) });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
